#!/bin/bash
# Mac / Linux 用のワンクリック起動。
# Finder でダブルクリックすればターミナルが開いて起動します。
cd "$(dirname "$0")" || exit 1

echo ""
echo "  お姉さん投資判定 を起動します"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js が見つかりません。"
  echo "  https://nodejs.org から LTS 版をインストールしてから、"
  echo "  もう一度このファイルをダブルクリックしてください。"
  echo ""
  read -r -p "  Enter キーで閉じます " _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  初回準備をしています。数分かかります…"
  echo ""
  if ! npm install; then
    echo ""
    echo "  準備に失敗しました。上のメッセージを確認してください。"
    read -r -p "  Enter キーで閉じます " _
    exit 1
  fi
fi

if ! npm run go; then
  echo ""
  echo "  起動に失敗しました。上のメッセージを確認してください。"
  read -r -p "  Enter キーで閉じます " _
  exit 1
fi
