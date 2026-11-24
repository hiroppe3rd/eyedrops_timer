# 点眼タイマー Docker 運用ショートカットスクリプト（PowerShell 版）
param(
  [Parameter(Position = 0)]
  [string]$Command = "help",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvFile = Join-Path $RepoRoot ".env"

function Get-EyedropsPort {
  $port = "8080"
  if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
      if ($line -match '^\s*EYEDROPS_PORT\s*=\s*(.+?)\s*$') {
        $val = $Matches[1].Trim('"', "'")
        if ($val) { $port = $val }
      }
    }
  }
  return $port
}

function Warn-IfNoEnv {
  if (-not (Test-Path $EnvFile)) {
    Write-Host "情報: .env が見つかりません（既定値で起動します。必要なら .env.example をコピーしてください）。"
  }
}

function Show-Usage {
  @"
使い方: .\scripts\eyedrops.ps1 <コマンド> [オプション]

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
"@
}

Push-Location $RepoRoot
try {
  switch ($Command.ToLower()) {
    { $_ -in "up", "start" } {
      Warn-IfNoEnv
      docker compose up -d --build @ExtraArgs
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
      Write-Host "本番モードで起動しました: http://127.0.0.1:$(Get-EyedropsPort)/"
    }
    "dev" {
      Warn-IfNoEnv
      docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d @ExtraArgs
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
      Write-Host "開発モードで起動しました: http://127.0.0.1:$(Get-EyedropsPort)/"
    }
    { $_ -in "down", "stop" } {
      docker compose down @ExtraArgs
      exit $LASTEXITCODE
    }
    "restart" {
      docker compose restart @ExtraArgs
      exit $LASTEXITCODE
    }
    "build" {
      docker compose build @ExtraArgs
      exit $LASTEXITCODE
    }
    { $_ -in "status", "ps" } {
      Write-Host "=== コンテナ状態 ==="
      docker compose ps @ExtraArgs
      $port = Get-EyedropsPort
      $url = "http://127.0.0.1:$port/"
      Write-Host ""
      Write-Host "=== HTTP 疎通確認 ($url) ==="
      try {
        $res = Invoke-WebRequest -Uri $url -TimeoutSec 3 -UseBasicParsing
        Write-Host "OK: $url (HTTP $($res.StatusCode))"
      } catch {
        Write-Host "NG: $url に接続できません。"
      }
    }
    "logs" {
      if ($ExtraArgs -and $ExtraArgs.Count -gt 0) {
        docker compose logs @ExtraArgs
      } else {
        docker compose logs -f --tail=100
      }
      exit $LASTEXITCODE
    }
    "test" {
      node tests/run_tests.mjs @ExtraArgs
      exit $LASTEXITCODE
    }
    { $_ -in "help", "-h", "--help" } {
      Show-Usage
    }
    default {
      Write-Error "不明なコマンド '$Command'"
      Show-Usage
      exit 1
    }
  }
} finally {
  Pop-Location
}
