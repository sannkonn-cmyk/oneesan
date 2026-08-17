#!/bin/bash
# Mac / Linux 用。Claude Desktop と Claude Code に、このアプリを
# 「読める場所」として登録します。読み取り専用・ネットワークなし。
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js が見つかりません。"
  echo "  https://nodejs.org から LTS 版をインストールしてください。"
  echo ""
  read -r -p "  Enter キーで閉じます " _
  exit 1
fi

node scripts/mcp-setup.mjs
read -r -p "  Enter キーで閉じます " _
