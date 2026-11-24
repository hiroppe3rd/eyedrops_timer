#!/usr/bin/env bash
set -euo pipefail

# 点眼タイマーを Apache2 の /eyedrops/ エイリアスで公開するセットアップスクリプト

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PUBLIC_DIR="${1:-${REPO_ROOT}/public}"
CONF_NAME="eyedrops"
CONF_AVAILABLE="/etc/apache2/conf-available/${CONF_NAME}.conf"
ALIAS_PATH="/eyedrops"

# root 権限の確認
if [[ "${EUID}" -ne 0 ]]; then
  echo "エラー: root 権限で実行してください（例: sudo $0）" >&2
  exit 1
fi

# 公開ディレクトリの存在確認
if [[ ! -d "${PUBLIC_DIR}" ]]; then
  echo "エラー: 公開ディレクトリが見つかりません: ${PUBLIC_DIR}" >&2
  exit 1
fi
PUBLIC_DIR="$(cd "${PUBLIC_DIR}" && pwd)"

# Apache2 コマンドの確認
if ! command -v a2enconf >/dev/null 2>&1 || ! command -v apache2ctl >/dev/null 2>&1; then
  echo "エラー: apache2 (a2enconf / apache2ctl) が見つかりません。" >&2
  exit 1
fi

# .env から公開用 env.js を生成
ENV_FILE="${REPO_ROOT}/.env"
if [[ -f "${ENV_FILE}" ]]; then
  GOOGLE_CLIENT_ID_VAL="$(grep -E '^[[:space:]]*GOOGLE_CLIENT_ID=' "${ENV_FILE}" | tail -n 1 | cut -d'=' -f2- | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^["'\'']//; s/["'\'']$//')"
  cat > "${PUBLIC_DIR}/js/env.js" <<ENVEOF
// .env から自動生成される環境設定（手動編集不要）
window.__EYEDROPS_ENV__ = {
  "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID_VAL}"
};
ENVEOF
  echo ".env の設定を ${PUBLIC_DIR}/js/env.js に反映しました。"
fi

# 設定ファイルの作成
cat > "${CONF_AVAILABLE}" <<EOF
# 点眼タイマー (/eyedrops/ エイリアス設定)
RedirectMatch 301 ^${ALIAS_PATH}\$ ${ALIAS_PATH}/
Alias ${ALIAS_PATH}/ "${PUBLIC_DIR}/"

<Directory "${PUBLIC_DIR}">
    Options -Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
    DirectoryIndex index.html

    <IfModule mod_mime.c>
        AddType application/manifest+json .webmanifest
    </IfModule>
</Directory>
EOF

echo "設定ファイルを作成しました: ${CONF_AVAILABLE}"

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

echo "セットアップが完了しました。${ALIAS_PATH}/ でアクセスできます。"
