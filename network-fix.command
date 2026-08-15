#!/bin/bash
# Mac / Linux 用。スマホから開けないときの点検。
# Mac の防火壁は既定で切れているので、多くの場合はネットワーク側の問題です。
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js が見つかりません。"
  echo "  https://nodejs.org から LTS 版をインストールしてください。"
  echo ""
  read -r -p "  Enter キーで閉じます " _
  exit 1
fi

node scripts/net-check.mjs
read -r -p "  Enter キーで閉じます " _
