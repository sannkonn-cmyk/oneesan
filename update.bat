@echo off
rem ---------------------------------------------------------------
rem Windows one-click updater.
rem
rem ASCII-only on purpose. cmd.exe reads .bat files with the system
rem ANSI code page (CP932 on Japanese Windows); UTF-8 Japanese here
rem corrupts the parser and the window closes with no message.
rem Japanese guidance is printed from Node (scripts/update.mjs).
rem ---------------------------------------------------------------
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"
title Oneesan - Update

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [ERROR] Node.js was not found.
  echo   Install the LTS version from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

node scripts\update.mjs
pause
