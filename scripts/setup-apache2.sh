#!/usr/bin/env bash
set -euo pipefail

# 点眼タイマーを Apache2 の /eyedrops/ から Docker コンテナへリバースプロキシするセットアップスクリプト

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONF_NAME="eyedrops"
CONF_AVAILABLE="/etc/apache2/conf-available/${CONF_NAME}.conf"
ALIAS_PATH="/eyedrops"
ENV_FILE="${REPO_ROOT}/.env"

# root 権限の確認
if [[ "${EUID}" -ne 0 ]]; then
  echo "エラー: root 権限で実行してください（例: sudo $0）" >&2
  exit 1
fi

# Apache2 コマンドの確認
for cmd in a2enconf a2enmod apache2ctl; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "エラー: apache2 (${cmd}) が見つかりません。" >&2
    exit 1
  fi
done

# .env からポート番号を読み取り（未設定時は 8080）
ENV_PORT="8080"
if [[ -f "${ENV_FILE}" ]]; then
  RAW_PORT="$(grep -E '^[[:space:]]*EYEDROPS_PORT=' "${ENV_FILE}" | tail -n 1 | cut -d'=' -f2- | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^["'\'']//; s/["'\'']$//' || true)"
  if [[ -n "${RAW_PORT}" ]]; then
    ENV_PORT="${RAW_PORT}"
  fi
fi

# 接続先コンテナ URL の決定（引数 > 環境変数 EYEDROPS_UPSTREAM > .env ポート）
RAW_UPSTREAM="${1:-${EYEDROPS_UPSTREAM:-http://127.0.0.1:${ENV_PORT}}}"
if [[ "${RAW_UPSTREAM}" =~ ^[0-9]+$ ]]; then
  BACKEND_URL="http://127.0.0.1:${RAW_UPSTREAM}"
else
  BACKEND_URL="${RAW_UPSTREAM%/}"
fi

# リバースプロキシ用モジュールの有効化
a2enmod proxy proxy_http >/dev/null

# 設定ファイルの作成
cat > "${CONF_AVAILABLE}" <<EOF
# 点眼タイマー (/eyedrops/ -> Docker コンテナへのリバースプロキシ設定)
RedirectMatch 301 ^${ALIAS_PATH}\$ ${ALIAS_PATH}/

ProxyRequests Off
ProxyPreserveHost On
ProxyPass ${ALIAS_PATH}/ ${BACKEND_URL}/
ProxyPassReverse ${ALIAS_PATH}/ ${BACKEND_URL}/
EOF

echo "設定ファイルを作成しました: ${CONF_AVAILABLE} (接続先: ${BACKEND_URL}/)"

# 設定の有効化と構文チェック
a2enconf "${CONF_NAME}"

if ! apache2ctl configtest; then
  echo "エラー: Apache2 の設定構文チェックに失敗しました。設定を無効化します。" >&2
  a2disconf "${CONF_NAME}" >/dev/null 2>&1 || true
  exit 1
fi

# Apache2 のリロード
if command -v systemctl >/dev/null 2>&1; then
  systemctl reload apache2
else
  service apache2 reload
fi

echo "Apache2 のセットアップが完了しました。${ALIAS_PATH}/ -> ${BACKEND_URL}/ で転送します。"

# コンテナ側の疎通確認（未起動時は案内のみ表示）
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 3 "${BACKEND_URL}/" >/dev/null 2>&1; then
    echo "接続先コンテナの疎通を確認しました。"
  else
    echo "注意: 接続先 (${BACKEND_URL}/) に応答がありません。コンテナを起動してください（例: bash scripts/eyedrops.sh up）。"
  fi
fi
