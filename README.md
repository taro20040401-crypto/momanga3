# momanga mirror

momon:GA リバースプロキシミラー。Python 標準ライブラリのみで動作し、広告除去・ツールバー注入・統計・ブックマーク等の機能を提供します。

## 機能

- オリジンサイト(momon-ga.com)のリバースプロキシ
- 広告・トラッキング要素の除去 (`strip.py`)
- 画像CDN(z1〜z4)を自ホスト配下に付け替え
- 閲覧中ページに軽量ツールバーを注入
  - 広告除去 ON/OFF トグル
  - ダーク/ライト テーマ切替 (LocalStorage保持)
  - 検索窓 (Enter でオリジン検索へ)
  - ブックマーク (LocalStorage)
  - 閲覧履歴 (最大20件)
  - ショートカットキー: `/` 検索, `B` ブックマーク, `T` テーマ, `G` トップ, `Esc` 閉じる
  - トップへ戻るフローティングボタン
- 管理API (`/_toolbar/stats`, `/_toolbar/config`)
  - `ADMIN_TOKEN` 環境変数で認証 (未設定時は公開)

## Render へのデプロイ手順

### 1. GitHub にリポジトリを作成

```bash
# このzipを展開後
cd momanga-mirror
git init
git add .
git commit -m "init: momanga mirror"
git branch -M main
git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
git push -u origin main
```

### 2. Render でWeb Serviceを作成

1. https://render.com にログイン
2. "New +" → "Web Service"
3. "Build and deploy from a Git repository" を選択
4. GitHubアカウントを連携し、上記リポジトリを選択
5. 設定は `render.yaml` が自動入力されます:
   - **Name**: `momanga-mirror`
   - **Runtime**: `Python`
   - **Plan**: Free
   - **Region**: Singapore
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python server.py`
   - **Health Check Path**: `/healthz`

### 3. 環境変数を設定 (任意)

`render.yaml` に `ADMIN_TOKEN` を `sync: false` で定義済みです。
Renderの管理画面で個別に設定してください:

- **ADMIN_TOKEN**: 統計・設定APIを保護するトークン (任意の文字列)
  - 未設定時: 統計/設定が誰でも閲覧可 (個人利用向け)
  - 設定時: `?token=xxx` / `Authorization: Bearer xxx` / Cookie `momanga_admin=xxx` で認証

### 4. デプロイ

"Create Web Service" をクリック。数分でデプロイ完了。
`https://momanga-mirror.onrender.com` のようなURLが発行されます。

## ローカル実行

```bash
python server.py
# http://localhost:10000 で起動
```

環境変数:

| 変数 | デフォルト | 説明 |
| --- | --- | --- |
| `PORT` | `10000` | 待ち受けポート |
| `ORIGIN` | `https://momon-ga.com` | オリジンURL |
| `UA` | Chrome 131 | User-Agent |
| `STRIP_ADS` | `1` | 広告除去デフォルト (0で無効) |
| `STRIP_ANALYTICS` | `0` | アナリティクス除去 (1で有効) |
| `ADMIN_TOKEN` | (なし) | 統計/設定APIの保護トークン |

## プレビュー

ツールバーの見た目だけ確認したい場合:

```bash
# ブラウザで preview.html を開く
# (server.py 起動不要、CSS/JS/ロゴをインライン化済み)
```

## ファイル構成

```
momanga-mirror/        # フラット構成（サブフォルダなし）
├── server.py          # プロキシ本体 + ツールバー注入 + API
├── strip.py           # 広告・トラッキング除去ルール
├── requirements.txt   # 標準ライブラリのみ (空)
├── render.yaml        # Render デプロイ設定
├── toolbar.css        # ツールバースタイル (ダーク/ライト対応)
├── toolbar.js         # ツールバーJS (LocalStorage、ショートカット)
├── logo.png           # ブランドロゴ
├── .gitignore
└── README.md
```

> 注意: Android のGitHubアプリ等ではサブフォルダがあるとファイル追加・編集がしづらいため、フラット構成にしています。全てのファイルがリポジトリルートに並びます。

## トラブルシューティング

### Render でデプロイが失敗する

- Python バージョン: `render.yaml` で `3.12.6` を指定済み
- requirements.txt は空 (標準ライブラリのみ) なのでpip依存はありません

### ツールバーが表示されない

- オリジンが HTML を返すパスでのみ注入されます (JSON/APIレスポンスには注入されません)
- `/_toolbar/css`, `/_toolbar/js`, `/_toolbar/logo` に直接アクセスして200が返るか確認

### 広告が除去されない

- 環境変数 `STRIP_ADS=1` を確認
- ツールバーの「広告除去 ON」になっているか確認 (Cookie `momanga_ads=1`)
- `strip.py` の正規表現ルールがオリジンHTMLにマッチするか確認

### 統計が取得できない (403)

- `ADMIN_TOKEN` を設定している場合、URLに `?token=<設定したトークン>` を付与
- またはブラウザのConsoleで `document.cookie='momanga_admin=<トークン>'` を実行

## 注意

- 本ミラーは個人利用を想定しています。オリジンサイトの利用規約を遵守してください。
- `momon-ga.com` は第三者のサイトです。本ツールはその運営者とは無関係です。
