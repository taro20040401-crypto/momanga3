/* momanga mirror toolbar v2 - inspired by mangaraw/klmanga
   機能:
     - ダーク/ライト テーマ切替 (LocalStorage保持)
     - 検索窓 (Enter でオリジン検索へ遷移)
     - ブックマーク (LocalStorage保持、ワンクリックで追加/削除)
     - 閲覧履歴 (LocalStorageに最大20件)
     - 広告除去トグル
     - 統計 / 設定 パネル
     - ショートカットキー (/ 検索、b ブックマーク、t テーマ、g トップ)
     - トップへ戻るフローティングボタン
     - ページ読み込みプログレスバー
     - モバイル: ハンバーガーでメニュー展開
*/
(function () {
  "use strict";

  var root = document.getElementById("momanga-toolbar");
  if (!root) return;

  var STORE_KEY = "momanga_v2";
  var HISTORY_MAX = 20;
  var defaultAds = root.getAttribute("data-default-ads") !== "0";

  // ===== ストレージ =====
  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { theme: "auto", bookmarks: [], history: [], ads: null };
      var d = JSON.parse(raw);
      if (!d.bookmarks) d.bookmarks = [];
      if (!d.history) d.history = [];
      return d;
    } catch (e) {
      return { theme: "auto", bookmarks: [], history: [], ads: null };
    }
  }
  function saveStore(d) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) {}
  }
  var store = loadStore();

  // ===== テーマ =====
  function applyTheme(t) {
    var dark;
    if (t === "auto") {
      dark = window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else {
      dark = t === "dark";
    }
    if (dark) {
      document.documentElement.classList.add("mt-dark");
    } else {
      document.documentElement.classList.remove("mt-dark");
    }
  }
  applyTheme(store.theme || "auto");

  // 自動テーマの場合は OS設定変更を監視
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if ((store.theme || "auto") === "auto") applyTheme("auto");
    });
  }

  // ===== 広告除去状態 =====
  function adsEnabled() {
    if (store.ads !== null && store.ads !== undefined) return store.ads;
    return defaultAds;
  }
  function setAds(on) {
    store.ads = on;
    saveStore(store);
    // サーバーセッションCookieにも反映
    document.cookie = "momanga_ads=" + (on ? "1" : "0") +
      "; Path=/; SameSite=Lax; Max-Age=86400";
  }

  // ===== Cookie値取得 =====
  function cookieValue(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
    return m ? m[1] : null;
  }
  // 既存Cookieからads初期状態を取得
  var adsCookie = cookieValue("momanga_ads");
  if (adsCookie !== null && store.ads === null) {
    store.ads = adsCookie === "1";
  }

  // ===== ユーティリティ =====
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#39;"
      }[c];
    });
  }
  function statusClass(s) {
    s = parseInt(s, 10) || 0;
    if (s < 300) return "mt-status-2";
    if (s < 400) return "mt-status-3";
    if (s < 500) return "mt-status-4";
    return "mt-status-5";
  }
  function timeAgo(ts) {
    var diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return "たった今";
    if (diff < 3600) return Math.floor(diff / 60) + "分前";
    if (diff < 86400) return Math.floor(diff / 3600) + "時間前";
    return Math.floor(diff / 86400) + "日前";
  }
  function pageTitle() {
    return (document.title || "").trim() || location.pathname;
  }

  // ===== 履歴・ブックマーク操作 =====
  function addHistory() {
    var entry = {
      url: location.pathname + location.search,
      title: pageTitle(),
      ts: Math.floor(Date.now() / 1000)
    };
    // 重複除去
    store.history = store.history.filter(function (h) {
      return h.url !== entry.url;
    });
    store.history.unshift(entry);
    if (store.history.length > HISTORY_MAX) {
      store.history = store.history.slice(0, HISTORY_MAX);
    }
    saveStore(store);
  }
  function toggleBookmark() {
    var url = location.pathname + location.search;
    var existing = store.bookmarks.filter(function (b) { return b.url === url; });
    if (existing.length) {
      store.bookmarks = store.bookmarks.filter(function (b) { return b.url !== url; });
    } else {
      store.bookmarks.unshift({
        url: url,
        title: pageTitle(),
        ts: Math.floor(Date.now() / 1000)
      });
    }
    saveStore(store);
    renderBookmarkBtn();
  }
  function isBookmarked() {
    var url = location.pathname + location.search;
    return store.bookmarks.some(function (b) { return b.url === url; });
  }
  function removeItem(kind, url) {
    if (kind === "bookmark") {
      store.bookmarks = store.bookmarks.filter(function (b) { return b.url !== url; });
    } else {
      store.history = store.history.filter(function (h) { return h.url !== url; });
    }
    saveStore(store);
  }

  // ===== アイコン =====
  var ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    bookmarkFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  };

  // ===== DOM構築 =====
  function buildShell() {
    var shell = document.createElement("div");
    shell.className = "mt-shell";
    shell.innerHTML =
      '<a class="mt-brand" href="/" title="momanga mirror">' +
        '<img src="/_toolbar/logo" alt="momanga" width="26" height="26">' +
        '<span class="mt-brand-text">momanga</span>' +
      '</a>' +
      '<div class="mt-search-wrap">' +
        '<span class="mt-search-icon">' + ICON.search + '</span>' +
        '<input class="mt-search" id="mt-search" type="search" ' +
          'placeholder="検索… (Enterで実行)" autocomplete="off">' +
        '<span class="mt-search-kbd">/</span>' +
      '</div>' +
      '<button class="mt-icon-btn" id="mt-bookmark-btn" type="button" title="ブックマーク (b)">' +
        ICON.bookmark +
      '</button>' +
      '<button class="mt-icon-btn mt-desktop-only" id="mt-history-btn" type="button" title="閲覧履歴">' +
        ICON.history +
        '<span class="mt-badge-dot" id="mt-history-count" style="display:none;">0</span>' +
      '</button>' +
      '<div class="mt-divider mt-desktop-only"></div>' +
      '<button class="mt-toggle" id="mt-ads-btn" type="button" title="広告除去">' +
        ICON.shield + '<span class="mt-label">広告除去</span>' +
      '</button>' +
      '<button class="mt-theme-toggle" id="mt-theme-btn" type="button" title="テーマ切替 (t)" aria-label="テーマ切替"></button>' +
      '<div class="mt-divider mt-desktop-only"></div>' +
      '<button class="mt-icon-btn mt-desktop-only" id="mt-stats-btn" type="button" title="統計">' + ICON.stats + '</button>' +
      '<button class="mt-icon-btn mt-desktop-only" id="mt-config-btn" type="button" title="設定">' + ICON.settings + '</button>' +
      '<button class="mt-icon-btn mt-desktop-only" id="mt-help-btn" type="button" title="ヘルプ (?)">' + ICON.help + '</button>' +
      '<button class="mt-icon-btn mt-mobile-only" id="mt-mobile-more-btn" type="button" title="メニュー">' + ICON.menu + '</button>' +
      '<button class="mt-hide" id="mt-hide-btn" type="button" title="ツールバーを隠す">×</button>';
    return shell;
  }

  var shell = buildShell();
  root.appendChild(shell);

  // 再展開ボタン
  var showBtn = document.createElement("button");
  showBtn.className = "mt-show";
  showBtn.type = "button";
  showBtn.innerHTML = ICON.menu + '<span>momanga</span>';
  showBtn.addEventListener("click", function () {
    root.classList.remove("collapsed");
  });
  root.appendChild(showBtn);

  // パネル
  var panel = document.createElement("div");
  panel.className = "mt-panel";
  root.appendChild(panel);

  // ローディングバー
  var loadingBar = document.createElement("div");
  loadingBar.className = "mt-loading-bar";
  loadingBar.id = "mt-loading";
  loadingBar.style.width = "0%";
  document.body.appendChild(loadingBar);

  // トップへ戻るボタン
  var topBtn = document.createElement("button");
  topBtn.className = "mt-top-btn";
  topBtn.type = "button";
  topBtn.innerHTML = ICON.arrowUp;
  topBtn.title = "トップへ戻る";
  topBtn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.body.appendChild(topBtn);

  window.addEventListener("scroll", function () {
    if (window.scrollY > 400) {
      topBtn.classList.add("visible");
    } else {
      topBtn.classList.remove("visible");
    }
  }, { passive: true });

  // ===== レンダリング =====
  function renderAdsBtn() {
    var btn = document.getElementById("mt-ads-btn");
    var on = adsEnabled();
    btn.className = "mt-toggle " + (on ? "on" : "off");
    btn.innerHTML = ICON.shield + '<span class="mt-label">広告除去 ' + (on ? "ON" : "OFF") + '</span>';
  }

  function renderBookmarkBtn() {
    var btn = document.getElementById("mt-bookmark-btn");
    if (isBookmarked()) {
      btn.innerHTML = ICON.bookmarkFilled;
      btn.classList.add("active");
      btn.title = "ブックマーク解除 (b)";
    } else {
      btn.innerHTML = ICON.bookmark;
      btn.classList.remove("active");
      btn.title = "ブックマークに追加 (b)";
    }
  }

  function renderHistoryCount() {
    var dot = document.getElementById("mt-history-count");
    if (!dot) return;
    var n = store.history.length;
    if (n > 0) {
      dot.textContent = n > 99 ? "99+" : String(n);
      dot.style.display = "";
    } else {
      dot.style.display = "none";
    }
  }

  function openPanel(html) {
    panel.innerHTML = '<div class="mt-panel-inner">' + html + "</div>";
    panel.classList.add("open");
    panel.setAttribute("data-mode", panel.getAttribute("data-mode") || "");
  }

  function openPanelMode(mode, html) {
    panel.innerHTML = '<div class="mt-panel-inner">' + html + "</div>";
    panel.classList.add("open");
    panel.setAttribute("data-mode", mode);
    attachPanelEvents();
  }

  function closePanel() {
    panel.classList.remove("open");
    panel.removeAttribute("data-mode");
  }

  function togglePanelMode(mode, htmlBuilder) {
    if (panel.getAttribute("data-mode") === mode && panel.classList.contains("open")) {
      return closePanel();
    }
    openPanelMode(mode, htmlBuilder());
  }

  function attachPanelEvents() {
    // ブックマーク/履歴の個別削除
    var removes = panel.querySelectorAll("[data-remove-kind]");
    removes.forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var kind = el.getAttribute("data-remove-kind");
        var url = el.getAttribute("data-remove-url");
        removeItem(kind, url);
        // パネル再描画
        if (panel.getAttribute("data-mode") === "bookmarks") {
          openPanelMode("bookmarks", renderBookmarks());
        } else if (panel.getAttribute("data-mode") === "history") {
          openPanelMode("history", renderHistory());
        }
        renderBookmarkBtn();
        renderHistoryCount();
      });
    });

    // リスト項目クリックで遷移
    var links = panel.querySelectorAll("[data-href]");
    links.forEach(function (el) {
      el.addEventListener("click", function () {
        var href = el.getAttribute("data-href");
        if (href) location.href = href;
      });
    });
  }

  // ===== 各パネル =====
  function renderBookmarks() {
    if (!store.bookmarks.length) {
      return '<h2>ブックマーク <span style="font-weight:400;color:var(--mt-fg-muted);font-size:12px;">' +
        store.bookmarks.length + '件</span></h2>' +
        '<div class="mt-empty">ブックマークがありません。<br>' +
        'ツールバーのブックマークボタン、または <kbd style="padding:1px 6px;background:var(--mt-bg-soft);border:1px solid var(--mt-border);border-radius:4px;">B</kbd> キーで現在ページを追加できます。</div>';
    }
    var html = '<h2>ブックマーク <span style="font-weight:400;color:var(--mt-fg-muted);font-size:12px;">' +
      store.bookmarks.length + '件</span></h2>';
    html += '<ul class="mt-list">';
    store.bookmarks.forEach(function (b) {
      html += '<li data-href="' + escapeHtml(b.url) + '">' +
        '<span class="mt-favicon">' + ICON.page + '</span>' +
        '<span class="mt-title">' + escapeHtml(b.title) + '</span>' +
        '<span class="mt-time">' + timeAgo(b.ts) + '</span>' +
        '<button class="mt-remove" data-remove-kind="bookmark" data-remove-url="' + escapeHtml(b.url) + '" title="削除">×</button>' +
        '</li>';
    });
    html += '</ul>';
    return html;
  }

  function renderHistory() {
    if (!store.history.length) {
      return '<h2>閲覧履歴</h2>' +
        '<div class="mt-empty">履歴がありません。<br>ミラーサイト内を閲覧すると自動的に記録されます。</div>';
    }
    var html = '<h2>閲覧履歴 <span style="font-weight:400;color:var(--mt-fg-muted);font-size:12px;">' +
      store.history.length + '件</span></h2>';
    html += '<ul class="mt-list">';
    store.history.forEach(function (h) {
      html += '<li data-href="' + escapeHtml(h.url) + '">' +
        '<span class="mt-favicon">' + ICON.history + '</span>' +
        '<span class="mt-title">' + escapeHtml(h.title) + '</span>' +
        '<span class="mt-time">' + timeAgo(h.ts) + '</span>' +
        '<button class="mt-remove" data-remove-kind="history" data-remove-url="' + escapeHtml(h.url) + '" title="削除">×</button>' +
        '</li>';
    });
    html += '</ul>';
    return html;
  }

  function renderStats(data) {
    var cards = [
      ["総リクエスト", data.total],
      ["稼働時間(秒)", data.uptime_sec]
    ];
    var statusList = Object.keys(data.by_status || {}).sort();
    var topPaths = data.top_paths || [];
    var recent = data.recent || [];

    var html = "<h3>統計</h3>";
    html += '<div class="mt-stats-grid">';
    cards.forEach(function (c) {
      html += '<div class="mt-stat-card"><div class="label">' +
        escapeHtml(c[0]) + '</div><div class="value">' +
        escapeHtml(c[1]) + "</div></div>";
    });
    html += "</div>";

    if (statusList.length) {
      html += '<h3>ステータスコード別</h3><div class="mt-stats-grid">';
      statusList.forEach(function (s) {
        html += '<div class="mt-stat-card"><div class="label">' +
          '<span class="mt-status ' + statusClass(s) + '">' +
          escapeHtml(s) + "</span></div><div class=\"value\">" +
          escapeHtml(data.by_status[s]) + "</div></div>";
      });
      html += "</div>";
    }

    if (topPaths.length) {
      html += '<h3>上位パス (Top 10)</h3>' +
        '<table class="mt-table"><thead><tr><th>パス</th><th>回数</th></tr></thead><tbody>';
      topPaths.forEach(function (p) {
        html += '<tr><td class="code">' + escapeHtml(p[0]) +
          "</td><td>" + escapeHtml(p[1]) + "</td></tr>";
      });
      html += "</tbody></table>";
    }

    if (recent.length) {
      html += '<h3>直近アクセス</h3>' +
        '<table class="mt-table"><thead><tr><th>Method</th><th>Path</th><th>Status</th></tr></thead><tbody>';
      recent.slice(0, 10).forEach(function (r) {
        html += '<tr><td>' + escapeHtml(r.method) +
          '</td><td class="code">' + escapeHtml(r.path) +
          '</td><td><span class="mt-status ' + statusClass(r.status) + '">' +
          escapeHtml(r.status) + "</span></td></tr>";
      });
      html += "</tbody></table>";
    }
    return html;
  }

  function renderConfig(data) {
    var html = "<h3>設定</h3><table class=\"mt-table\"><tbody>";
    Object.keys(data).forEach(function (k) {
      var v = data[k];
      if (typeof v === "object" && v !== null) v = JSON.stringify(v, null, 2);
      html += "<tr><th>" + escapeHtml(k) +
        '</th><td class="code">' + escapeHtml(v) + "</td></tr>";
    });
    html += "</tbody></table>";
    if (data.ADMIN_TOKEN_SET) {
      html += '<div class="mt-badge">admin token: 設定済み</div>';
    } else {
      html += '<div class="mt-badge warn">admin token: 未設定 (統計/設定は誰でも閲覧可)</div>';
    }
    return html;
  }

  function renderHelp() {
    return '<h2>ヘルプ・ショートカット</h2>' +
      '<div class="mt-help">' +
      '<div class="mt-help-row"><span class="keys"><kbd>/</kbd></span>' +
        '<span class="desc">検索窓にフォーカス</span></div>' +
      '<div class="mt-help-row"><span class="keys"><kbd>Enter</kbd></span>' +
        '<span class="desc">検索実行 (オリジンサイトへ)</span></span></div>' +
      '<div class="mt-help-row"><span class="keys"><kbd>B</kbd></span>' +
        '<span class="desc">現在ページをブックマーク</span></div>' +
      '<div class="mt-help-row"><span class="keys"><kbd>T</kbd></span>' +
        '<span class="desc">ダーク/ライト テーマ切替</span></div>' +
      '<div class="mt-help-row"><span class="keys"><kbd>G</kbd></span>' +
        '<span class="desc">ページ先頭へスクロール</span></div>' +
      '<div class="mt-help-row"><span class="keys"><kbd>Esc</kbd></span>' +
        '<span class="desc">パネルを閉じる・検索クリア</span></div>' +
      '</div>' +
      '<h3>機能</h3>' +
      '<div class="mt-help">' +
      '<div class="mt-help-row"><span class="desc">・広告除去: ページ上部のバナー・トラッキングを除去</span></div>' +
      '<div class="mt-help-row"><span class="desc">・ブックマーク: LocalStorageに保存(端末間非同期)</span></div>' +
      '<div class="mt-help-row"><span class="desc">・履歴: 直近20件を自動記録</span></div>' +
      '<div class="mt-help-row"><span class="desc">・テーマ: システム設定に追従 or 手動切替</span></div>' +
      '</div>';
  }

  function renderMobileMenu() {
    var on = adsEnabled();
    var themeLabel = (store.theme || "auto") === "dark" ? "ダーク" :
                     (store.theme || "auto") === "light" ? "ライト" : "自動";
    return '<h2>メニュー</h2>' +
      '<ul class="mt-list">' +
        '<li id="mt-mm-bookmarks"><span class="mt-favicon">' + ICON.bookmark + '</span>' +
          '<span class="mt-title">ブックマーク</span>' +
          '<span class="mt-time">' + store.bookmarks.length + '</span></li>' +
        '<li id="mt-mm-history"><span class="mt-favicon">' + ICON.history + '</span>' +
          '<span class="mt-title">閲覧履歴</span>' +
          '<span class="mt-time">' + store.history.length + '</span></li>' +
        '<li id="mt-mm-stats"><span class="mt-favicon">' + ICON.stats + '</span>' +
          '<span class="mt-title">統計</span></li>' +
        '<li id="mt-mm-config"><span class="mt-favicon">' + ICON.settings + '</span>' +
          '<span class="mt-title">設定</span></li>' +
        '<li id="mt-mm-help"><span class="mt-favicon">' + ICON.help + '</span>' +
          '<span class="mt-title">ヘルプ</span></li>' +
        '<li id="mt-mm-theme"><span class="mt-favicon">' + ICON.sun + '</span>' +
          '<span class="mt-title">テーマ: ' + themeLabel + '</span></li>' +
        '<li id="mt-mm-ads"><span class="mt-favicon">' + ICON.shield + '</span>' +
          '<span class="mt-title">広告除去: ' + (on ? "ON" : "OFF") + '</span></li>' +
      '</ul>';
  }

  // ===== API通信 =====
  function fetchJson(url, ok, fail) {
    showLoading();
    fetch(url, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(ok)
      .catch(fail)
      .finally(hideLoading);
  }

  function showLoading() {
    loadingBar.style.width = "30%";
    loadingBar.classList.add("active");
  }
  function hideLoading() {
    loadingBar.style.width = "100%";
    setTimeout(function () {
      loadingBar.classList.remove("active");
      loadingBar.style.width = "0%";
    }, 300);
  }

  // ===== イベントハンドラ =====
  // 検索
  var searchInput = document.getElementById("mt-search");
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var q = searchInput.value.trim();
      if (!q) return;
      // オリジンサイトの検索へ遷移
      location.href = "/?s=" + encodeURIComponent(q);
    }
    if (e.key === "Escape") {
      searchInput.value = "";
      searchInput.blur();
    }
  });

  // ブックマーク
  document.getElementById("mt-bookmark-btn").addEventListener("click", function () {
    toggleBookmark();
    // パネルが開いていれば更新
    if (panel.getAttribute("data-mode") === "bookmarks") {
      openPanelMode("bookmarks", renderBookmarks());
    }
  });

  // 履歴
  document.getElementById("mt-history-btn").addEventListener("click", function () {
    togglePanelMode("history", renderHistory);
  });

  // 広告除去トグル
  document.getElementById("mt-ads-btn").addEventListener("click", function () {
    var newAds = !adsEnabled();
    setAds(newAds);
    renderAdsBtn();
    // リロードして適用
    location.reload();
  });

  // テーマ切替
  function cycleTheme() {
    var cur = store.theme || "auto";
    var next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
    store.theme = next;
    saveStore(store);
    applyTheme(next);
  }
  document.getElementById("mt-theme-btn").addEventListener("click", cycleTheme);

  // 統計
  document.getElementById("mt-stats-btn").addEventListener("click", function () {
    togglePanelMode("stats", function () {
      return '<h2>統計</h2><div class="mt-empty">読み込み中…</div>';
    });
    fetchJson("/_toolbar/stats", function (data) {
      if (panel.getAttribute("data-mode") === "stats") {
        openPanelMode("stats", renderStats(data));
      }
    }, function (e) {
      if (panel.getAttribute("data-mode") === "stats") {
        openPanelMode("stats",
          '<h2>統計</h2><div class="mt-error">統計を取得できませんでした: ' +
          escapeHtml(e.message) + "<br>※ ADMIN_TOKEN が設定されている場合は、" +
          "URL に ?token=xxx を付与するか、Cookie momanga_admin=xxx を設定してください。</div>"
        );
      }
    });
  });

  // 設定
  document.getElementById("mt-config-btn").addEventListener("click", function () {
    togglePanelMode("config", function () {
      return '<h2>設定</h2><div class="mt-empty">読み込み中…</div>';
    });
    fetchJson("/_toolbar/config", function (data) {
      if (panel.getAttribute("data-mode") === "config") {
        openPanelMode("config", renderConfig(data));
      }
    }, function (e) {
      if (panel.getAttribute("data-mode") === "config") {
        openPanelMode("config",
          '<h2>設定</h2><div class="mt-error">設定を取得できませんでした: ' +
          escapeHtml(e.message) + "<br>※ ADMIN_TOKEN が設定されている場合は、" +
          "URL に ?token=xxx を付与するか、Cookie momanga_admin=xxx を設定してください。</div>"
        );
      }
    });
  });

  // ヘルプ
  document.getElementById("mt-help-btn").addEventListener("click", function () {
    togglePanelMode("help", renderHelp);
  });

  // モバイルメニュー
  document.getElementById("mt-mobile-more-btn").addEventListener("click", function () {
    togglePanelMode("mobile-menu", renderMobileMenu);
    // メニュー内のアイテムにイベント付与
    setTimeout(function () {
      var items = panel.querySelectorAll("[id^='mt-mm-']");
      items.forEach(function (el) {
        el.addEventListener("click", function () {
          var id = el.id;
          if (id === "mt-mm-bookmarks") openPanelMode("bookmarks", renderBookmarks());
          else if (id === "mt-mm-history") openPanelMode("history", renderHistory);
          else if (id === "mt-mm-stats") document.getElementById("mt-stats-btn").click();
          else if (id === "mt-mm-config") document.getElementById("mt-config-btn").click();
          else if (id === "mt-mm-help") openPanelMode("help", renderHelp());
          else if (id === "mt-mm-theme") cycleTheme();
          else if (id === "mt-mm-ads") document.getElementById("mt-ads-btn").click();
        });
      });
    }, 0);
  });

  // 折りたたみ
  document.getElementById("mt-hide-btn").addEventListener("click", function () {
    root.classList.add("collapsed");
    closePanel();
  });

  // ===== ショートカットキー =====
  document.addEventListener("keydown", function (e) {
    // 入力中は無視
    var tag = (e.target.tagName || "").toLowerCase();
    var isInput = tag === "input" || tag === "textarea" || tag === "select";
    if (isInput && e.key !== "Escape") return;

    if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === "b" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleBookmark();
      renderBookmarkBtn();
    } else if (e.key === "t" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      cycleTheme();
    } else if (e.key === "g" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (e.key === "Escape") {
      if (panel.classList.contains("open")) closePanel();
      else if (document.activeElement === searchInput) {
        searchInput.value = "";
        searchInput.blur();
      }
    }
  });

  // ===== 初期化 =====
  renderAdsBtn();
  renderBookmarkBtn();
  renderHistoryCount();
  addHistory();
})();
