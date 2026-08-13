@echo off
rem Windows 用のワンクリック起動。このファイルをダブルクリックしてください。
chcp 65001 >nul
cd /d "%~dp0"
title お姉さん投資判定

echo.
echo   お姉さん投資判定 を起動します
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js が見つかりません。
  echo   https://nodejs.org から LTS 版をインストールしてから、
  echo   もう一度このファイルをダブルクリックしてください。
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo   初回準備をしています。数分かかります...
  echo.
  call npm install
  if errorlevel 1 goto fail
)

call npm run go
if errorlevel 1 goto fail
exit /b 0

:fail
echo.
echo   起動に失敗しました。上のメッセージを確認してください。
pause
exit /b 1
