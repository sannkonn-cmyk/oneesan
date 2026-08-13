#!/bin/bash
# Mac / Linux 用のワンクリック更新。
# 学習データ（data/）と設定（.env.local）はそのまま残します。
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js が見つかりません。"
  echo "  https://nodejs.org から LTS 版をインストールしてください。"
  echo ""
  read -r -p "  Enter キーで閉じます " _
  exit 1
fi

node scripts/update.mjs
read -r -p "  Enter キーで閉じます " _
