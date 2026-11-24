#!/usr/bin/env bash
set -euo pipefail

# 点眼タイマー Docker 運用ショートカットスクリプト

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

cd "${REPO_ROOT}"

# docker compose コマンドの解決
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "エラー: docker compose が見つかりません。" >&2
  exit 1
fi

# .env から公開ポートを取得（未設定時は 8080）
get_port() {
  local port="8080"
  if [[ -f "${ENV_FILE}" ]]; then
    local raw
    raw="$(grep -E '^[[:space:]]*EYEDROPS_PORT=' "${ENV_FILE}" | tail -n 1 | cut -d'=' -f2- | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/^["'\'']//; s/["'\'']$//' || true)"
    if [[ -n "${raw}" ]]; then
      port="${raw}"
    fi
  fi
  echo "${port}"
}

# .env 未作成時の案内
warn_if_no_env() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "情報: .env が見つかりません（既定値で起動します。必要なら .env.example をコピーしてください）。"
  fi
}

usage() {
  cat <<EOF
使い方: bash scripts/eyedrops.sh <コマンド> [オプション]

コマンド:
  up, start   本番モードでビルド＆起動（イメージ内包ファイルで配信）
  dev         開発モードで起動（./public をマウントして即時反映）
  down, stop  コンテナ停止・削除
  restart     コンテナ再起動
  build       Docker イメージの再ビルド
  status, ps  コンテナ状態とローカル HTTP 疎通の確認
  logs        コンテナログの表示（既定: -f --tail=100）
  test        自動検証テストの実行
  help        このヘルプを表示
EOF
}

CMD="${1:-help}"
shift || true

case "${CMD}" in
  up|start)
    warn_if_no_env
    "${COMPOSE_CMD[@]}" up -d --build "$@"
    echo "本番モードで起動しました: http://127.0.0.1:$(get_port)/"
    ;;
  dev)
    warn_if_no_env
    "${COMPOSE_CMD[@]}" -f docker-compose.yml -f docker-compose.dev.yml up -d "$@"
    echo "開発モードで起動しました: http://127.0.0.1:$(get_port)/"
    ;;
  down|stop)
    "${COMPOSE_CMD[@]}" down "$@"
    ;;
  restart)
    "${COMPOSE_CMD[@]}" restart "$@"
    ;;
  build)
    "${COMPOSE_CMD[@]}" build "$@"
    ;;
  status|ps)
    echo "=== コンテナ状態 ==="
    "${COMPOSE_CMD[@]}" ps "$@"

    PORT="$(get_port)"
    URL="http://127.0.0.1:${PORT}/"
    echo ""
    echo "=== HTTP 疎通確認 (${URL}) ==="
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 3 -o /dev/null "${URL}"; then
        echo "OK: ${URL} は正常に応答しています。"
      else
        echo "NG: ${URL} に接続できません。"
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget -q -T 3 -O /dev/null "${URL}"; then
        echo "OK: ${URL} は正常に応答しています。"
      else
        echo "NG: ${URL} に接続できません。"
      fi
    else
      echo "情報: curl / wget がないため疎通確認をスキップしました。"
    fi

    if [[ -e "/etc/apache2/conf-enabled/eyedrops.conf" ]]; then
      echo ""
      echo "=== Apache2 リバースプロキシ設定 ==="
      echo "有効: /etc/apache2/conf-enabled/eyedrops.conf"
    fi
    ;;
  logs)
    if [[ "$#" -eq 0 ]]; then
      "${COMPOSE_CMD[@]}" logs -f --tail=100
    else
      "${COMPOSE_CMD[@]}" logs "$@"
    fi
    ;;
  test)
    node tests/run_tests.mjs "$@"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "エラー: 不明なコマンド '${CMD}'" >&2
    usage
    exit 1
    ;;
esac
