#!/usr/bin/env python3
"""momon:GA リバースプロキシミラー / 標準ライブラリのみ / Python 3.11+

改修点:
  - 閲覧体験向上のため、HTML レスポンスに軽量ツールバーを注入
  - ツールバーから操作できる API エンドポイントを追加
    * /_toolbar/css, /_toolbar/js  : ツールバー静的リソース
    * /_toolbar/toggle-ads         : 広告除去 ON/OFF (セッションCookie)
    * /_toolbar/stats              : アクセス統計 (要ADMIN_TOKEN)
    * /_toolbar/config             : 設定表示 (要ADMIN_TOKEN)
  - リクエスト統計をメモリに蓄積(スレッドセーフ)
"""
import gzip
import http.client
import json
import os
import re
import ssl
import threading
import time
import zlib
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

from strip import strip_ads

PORT = int(os.environ.get("PORT", "10000"))
ORIGIN = os.environ.get("ORIGIN", "https://momon-ga.com")
UA = os.environ.get(
    "UA",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
)
STRIP_ADS = os.environ.get("STRIP_ADS", "1") != "0"
STRIP_ANALYTICS = os.environ.get("STRIP_ANALYTICS", "0") == "1"
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

# フラット構成: スクリプトと同じディレクトリに toolbar.css / toolbar.js / logo.png を置く
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_FILES = {
    "toolbar.css": "text/css; charset=utf-8",
    "toolbar.js": "application/javascript; charset=utf-8",
    "logo.png": "image/png",
}

# 画像CDN → 自ホスト配下のパスへ付け替え
CDN_ROUTES = {
    "/_cdn/z1/": "https://z1.momon-ga.me/",
    "/_cdn/z2/": "https://z2.momon-ga.me/",
    "/_cdn/z3/": "https://z3.momon-ga.me/",
    "/_cdn/z4/": "https://z4.momon-ga.me/",
}

HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade", "content-encoding",
    "content-length", "x-frame-options", "content-security-policy",
    "content-security-policy-report-only",
}

REWRITES = [
    # JSON文字列内のエスケープ済み形式
    ("https:\\/\\/z1.momon-ga.me", "\\/_cdn\\/z1"),
    ("https:\\/\\/z2.momon-ga.me", "\\/_cdn\\/z2"),
    ("https:\\/\\/z3.momon-ga.me", "\\/_cdn\\/z3"),
    ("https:\\/\\/momon-ga.com", ""),
    ("http:\\/\\/momon-ga.com", ""),
    # 通常形式
    ("https://z1.momon-ga.me", "/_cdn/z1"),
    ("https://z2.momon-ga.me", "/_cdn/z2"),
    ("https://z3.momon-ga.me", "/_cdn/z3"),
    ("https://momon-ga.com", ""),
    ("http://momon-ga.com", ""),
    ("//momon-ga.com", ""),
]

SSL_CTX = ssl.create_default_context()

# --- 統計収集(メモリ・スレッドセーフ) ---
_stats_lock = threading.Lock()
_stats = {
    "total": 0,
    "by_status": defaultdict(int),
    "by_path": defaultdict(int),
    "recent": deque(maxlen=50),
    "started_at": time.time(),
}


def record_stats(method: str, path: str, status: int) -> None:
    with _stats_lock:
        _stats["total"] += 1
        _stats["by_status"][status] += 1
        _stats["by_path"][path] += 1
        _stats["recent"].appendleft({
            "method": method, "path": path, "status": status,
            "ts": int(time.time()),
        })


def apply_rewrites(s: str) -> str:
    for frm, to in REWRITES:
        s = s.replace(frm, to)
    return s


re_sub_domain = re.compile(r";\s*domain=[^;]*", re.I)
re_sub_secure = re.compile(r";\s*secure", re.I)
re_ads_cookie = re.compile(r"momanga_ads=(\d)")
re_admin_cookie = re.compile(r"momanga_admin=([^;]+)")


def strip_domain(cookie: str) -> str:
    out = re_sub_domain.sub("", cookie)
    return re_sub_secure.sub("", out)


def resolve_target(path: str):
    for prefix, base in CDN_ROUTES.items():
        if path.startswith(prefix):
            return base + path[len(prefix):], False, True
    return ORIGIN + path, True, False


def decode_body(raw: bytes, encoding: str) -> bytes:
    enc = (encoding or "").lower()
    if enc == "gzip":
        return gzip.decompress(raw)
    if enc == "deflate":
        return zlib.decompress(raw)
    return raw


def build_toolbar_snippet() -> str:
    """HTMLに注入するツールバー起動スニペット。<link>, <div>, <script> を
    1行にまとめて返す。CSS/JS本体は /_toolbar/css, /_toolbar/js で別配信。"""
    default_ads = "1" if STRIP_ADS else "0"
    return (
        '<link rel="stylesheet" href="/_toolbar/css">'
        '<div id="momanga-toolbar" data-default-ads="' + default_ads + '"></div>'
        '<script src="/_toolbar/js" defer></script>'
    )


def inject_toolbar(html: str) -> str:
    snippet = build_toolbar_snippet()
    lower = html.lower()
    idx = lower.rfind("</body>")
    if idx == -1:
        return html + snippet
    return html[:idx] + snippet + html[idx:]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print("%s %s" % (self.command, self.path), flush=True)

    # --- メソッド入口 ---
    def do_GET(self): self._handle("GET")
    def do_HEAD(self): self._handle("HEAD")
    def do_POST(self): self._handle("POST")
    def do_PUT(self): self._handle("PUT")
    def do_PATCH(self): self._handle("PATCH")
    def do_DELETE(self): self._handle("DELETE")
    def do_OPTIONS(self): self._handle("OPTIONS")

    # --- レスポンスヘルパ ---
    def _simple(self, status, body: bytes, ctype: str, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, obj, extra=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._simple(status, body, "application/json; charset=utf-8", extra)

    def _serve_static(self, name: str, ctype: str):
        path = os.path.join(SCRIPT_DIR, name)
        if not os.path.exists(path):
            return self._simple(404, b"not found", "text/plain; charset=utf-8")
        with open(path, "rb") as f:
            data = f.read()
        self._simple(200, data, ctype, {"Cache-Control": "public, max-age=3600"})

    # --- 認証・設定 ---
    def _check_admin(self) -> bool:
        """ADMIN_TOKEN 未設定なら誰でもOK。設定時は ?token=xxx /
        Authorization: Bearer xxx / Cookie momanga_admin=xxx のいずれかで照合。"""
        if not ADMIN_TOKEN:
            return True
        if "?" in self.path:
            qs = parse_qs(self.path.split("?", 1)[1])
            if qs.get("token", [None])[0] == ADMIN_TOKEN:
                return True
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer ") and auth[7:] == ADMIN_TOKEN:
            return True
        cookie = self.headers.get("Cookie", "")
        m = re_admin_cookie.search(cookie)
        if m and m.group(1) == ADMIN_TOKEN:
            return True
        return False

    def _should_strip_ads(self) -> bool:
        """Cookie momanga_ads があればその値、無ければ環境変数 STRIP_ADS に従う。"""
        cookie = self.headers.get("Cookie", "")
        m = re_ads_cookie.search(cookie)
        if m:
            return m.group(1) == "1"
        return STRIP_ADS

    # --- API エンドポイント ---
    def _api_toggle_ads(self):
        """現在の広告除去状態を反転させ、Cookieに保存してリロードを促す。"""
        current = self._should_strip_ads()
        new_val = "0" if current else "1"
        body = b"ok"
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header(
            "Set-Cookie",
            "momanga_ads=%s; Path=/; SameSite=Lax; Max-Age=86400" % new_val,
        )
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)
        record_stats(self.command, self.path, 200)

    def _api_stats(self):
        if not self._check_admin():
            return self._json(403, {
                "error": "forbidden",
                "hint": "?token=xxx を付与するか Cookie momanga_admin を設定してください",
            })
        with _stats_lock:
            data = {
                "total": _stats["total"],
                "by_status": dict(_stats["by_status"]),
                "top_paths": sorted(_stats["by_path"].items(), key=lambda x: -x[1])[:10],
                "recent": list(_stats["recent"]),
                "uptime_sec": int(time.time() - _stats["started_at"]),
            }
        self._json(200, data)

    def _api_config(self):
        if not self._check_admin():
            return self._json(403, {
                "error": "forbidden",
                "hint": "?token=xxx を付与するか Cookie momanga_admin を設定してください",
            })
        data = {
            "ORIGIN": ORIGIN,
            "PORT": PORT,
            "STRIP_ADS": STRIP_ADS,
            "STRIP_ANALYTICS": STRIP_ANALYTICS,
            "ADMIN_TOKEN_SET": bool(ADMIN_TOKEN),
            "CDN_ROUTES": CDN_ROUTES,
            "UA": UA,
        }
        self._json(200, data)

    # --- メインディスパッチ ---
    def _handle(self, method: str):
        # ヘルスチェック
        if self.path == "/healthz":
            return self._simple(200, b"ok", "text/plain; charset=utf-8")

        # ツールバー静的リソース
        if self.path == "/_toolbar/css":
            return self._serve_static("toolbar.css", "text/css; charset=utf-8")
        if self.path == "/_toolbar/js":
            return self._serve_static("toolbar.js", "application/javascript; charset=utf-8")
        if self.path == "/_toolbar/logo":
            return self._serve_static("logo.png", "image/png")

        # 管理API (path のみで判定、クエリは無視)
        path_only = self.path.split("?", 1)[0]
        if path_only == "/_toolbar/toggle-ads" and method in ("GET", "POST"):
            return self._api_toggle_ads()
        if path_only == "/_toolbar/stats" and method == "GET":
            return self._api_stats()
        if path_only == "/_toolbar/config" and method == "GET":
            return self._api_config()

        # --- プロキシ処理 ---
        path, _, query = self.path.partition("?")
        target, rewritable, asset = resolve_target(path or "/")
        if query:
            target += "?" + query

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        headers = {
            "User-Agent": UA,
            "Accept": self.headers.get("Accept", "*/*"),
            "Accept-Language": self.headers.get("Accept-Language", "ja,en-US;q=0.8"),
            "Accept-Encoding": "identity",
            "Referer": ORIGIN + "/",
        }
        if self.headers.get("Cookie"):
            # momanga_* 系Cookieはオリジンに送らない
            cookies = [
                c.strip() for c in self.headers["Cookie"].split(";")
                if c.strip() and not c.strip().startswith("momanga_")
            ]
            if cookies:
                headers["Cookie"] = "; ".join(cookies)

        u = urlsplit(target)
        conn_path = (u.path or "/") + (("?" + u.query) if u.query else "")

        try:
            conn = http.client.HTTPSConnection(u.hostname, 443, context=SSL_CTX, timeout=30)
            conn.request(method, conn_path, body=body, headers=headers)
            resp = conn.getresponse()
            raw = resp.read()
            status = resp.status
            resp_headers = resp.headers
            encoding = resp_headers.get("Content-Encoding", "")
            conn.close()
        except Exception as exc:  # noqa: BLE001
            record_stats(method, self.path, 502)
            return self._simple(
                502,
                ("upstream error: %s" % exc).encode(),
                "text/plain; charset=utf-8",
            )

        data = decode_body(raw, encoding)
        ctype = resp_headers.get("Content-Type", "")
        is_html = "text/html" in ctype.lower()
        is_json = "application/json" in ctype.lower()

        if rewritable and (is_html or is_json):
            text = apply_rewrites(data.decode("utf-8", "replace"))
            if is_html:
                if self._should_strip_ads():
                    text = strip_ads(text, analytics=STRIP_ANALYTICS)
                text = inject_toolbar(text)
            data = text.encode("utf-8")

        self.send_response(status)

        for key, value in resp_headers.items():
            if key.lower() in HOP or key.lower() == "set-cookie":
                continue
            self.send_header(key, value)

        for cookie in resp_headers.get_all("Set-Cookie") or []:
            self.send_header("Set-Cookie", strip_domain(cookie))

        location = resp_headers.get("Location")
        if location:
            self.send_header("Location", apply_rewrites(location))

        if asset:
            self.send_header("Cache-Control", "public, max-age=86400")

        self.send_header("X-Mirror", "momanga")
        if status not in (204, 304):
            self.send_header("Content-Length", str(len(data)))

        self.end_headers()
        if self.command != "HEAD" and status not in (204, 304):
            self.wfile.write(data)

        record_stats(method, self.path, status)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    print("mirror listening on :%d" % PORT, flush=True)
    print("ORIGIN=%s" % ORIGIN, flush=True)
    print("admin token: %s" % ("set" if ADMIN_TOKEN else "(none - 統計/設定は公開)"), flush=True)
    Server(("0.0.0.0", PORT), Handler).serve_forever()
