@echo off
rem ---------------------------------------------------------------
rem Windows one-click launcher.
rem
rem This file is intentionally ASCII-only. cmd.exe reads .bat files
rem using the system ANSI code page (CP932 on Japanese Windows), so
rem UTF-8 Japanese text inside a .bat can corrupt the parser and make
rem the window close instantly with no message. Japanese guidance is
rem printed from Node instead (scripts/bootstrap.mjs, lan-url.mjs).
rem ---------------------------------------------------------------
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title Oneesan

echo.
echo   Starting up...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] Node.js was not found.
  echo.
  echo   Install the LTS version from https://nodejs.org
  echo   restart Windows, then run this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] npm was not found. Please reinstall Node.js.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo   First-time setup. This takes a few minutes. Please wait...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [ERROR] Setup failed. Please send the messages above.
    echo.
    pause
    exit /b 1
  )
)

call npm run go
if errorlevel 1 (
  echo.
  echo   [ERROR] Failed to start. Please send the messages above.
  echo.
  pause
  exit /b 1
)

rem Reached after Ctrl+C. Keep the window open so nothing vanishes silently.
echo.
echo   Stopped.
pause
