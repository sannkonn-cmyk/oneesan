@echo off
rem ---------------------------------------------------------------
rem Opens TCP 3000 so a phone on the same router can reach the app.
rem Needs administrator rights, so it relaunches itself elevated.
rem
rem ASCII-only on purpose. cmd.exe reads .bat files with the system
rem ANSI code page (CP932 on Japanese Windows); UTF-8 Japanese here
rem corrupts the parser and the window closes with no message.
rem Japanese guidance is printed from Node (scripts/net-check.mjs).
rem ---------------------------------------------------------------
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title Oneesan - Network

net session >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Asking for administrator permission...
  echo   Please choose "Yes" in the dialog.
  echo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [ERROR] Node.js was not found.
  echo   Install the LTS version from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Allowing inbound TCP 3000 for private networks...

netsh advfirewall firewall delete rule name="Oneesan (port 3000)" >nul 2>nul
netsh advfirewall firewall add rule name="Oneesan (port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=private,domain >nul
if errorlevel 1 (
  echo.
  echo   [ERROR] Could not add the firewall rule.
  echo.
  pause
  exit /b 1
)

echo   Done.

node scripts\net-check.mjs
pause
