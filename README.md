# 点眼タイマー

点眼する薬と各工程の時間をルーティンとして登録し、音声ガイドに沿って実行するブラウザー向けタイマーです。完了したルーティンは、利用者のGoogleアカウントを認証したうえでGoogleカレンダーに記録することを目指します。

## 主な機能

- ルーティンの作成、編集、保存
- 点眼薬ごとの「準備」「直後の瞑想」「次の点眼までの待機」の設定
- ルーティン一覧から選択してタイマーを開始
- 工程開始、残り5秒からのカウントダウン、工程完了の音声案内
- 完了画面からGoogleカレンダーへ実行内容を保存

最後の点眼薬には、次の点眼までの待機工程を設定しません。

## 開発状況

フェーズ1〜6（土台・ルーティン管理・タイマー実行・音声案内・Googleカレンダー連携・自動検証テスト）まで実装完了しています。

## 起動方法・テスト

- **本番 Docker 起動**: `bash scripts/eyedrops.sh up`（または `docker compose up -d --build`）を実行後、`http://localhost:8080` にアクセス
- **ローカル開発起動**: `bash scripts/eyedrops.sh dev`（`./public` をマウントして即時反映）
- **ステータス・ログ・停止**: `bash scripts/eyedrops.sh status` / `logs` / `down`（Windows PowerShell は `.\scripts\eyedrops.ps1` を使用）
- **Apache2 リバースプロキシ (`/eyedrops/`)**: Linux (Apache2) 環境で `sudo bash scripts/setup-apache2.sh` を実行し、起動中の Docker コンテナへ接続（接続先変更時は引数で URL またはポートを指定）
- **自動検証テスト**: `node tests/run_tests.mjs`（または `bash scripts/eyedrops.sh test`）
- **Googleカレンダー連携**:
  - `.env` に `GOOGLE_CLIENT_ID` を設定してコンテナを起動すると、Google Calendar API（GIS 認証）による直接記録が有効になります（静的配信のみ行う場合は `node scripts/generate-config.mjs`）。
  - `GOOGLE_CLIENT_ID` が未設定の場合は、入力済みの Google カレンダー予定作成画面を別タブで開く URL 連携のみが動作します。

## 計画

実装方針と検証項目は [計画書](docs/plan.md) を参照してください。
