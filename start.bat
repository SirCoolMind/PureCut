@echo off
title PureCut - In-Browser AI Background Remover
cd /d "%~dp0"

echo =======================================================
echo          PureCut - AI Background Remover Studio
echo =======================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your PATH!
    echo Please install Node.js from https://nodejs.org/ to run PureCut.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] First time setup: Installing dependencies...
    echo This might take 1-2 minutes. Please wait...
    echo.
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo.
echo [INFO] Starting PureCut server...
echo Your web browser will open automatically at http://localhost:5173
echo.
echo Press Ctrl+C in this terminal whenever you want to stop the app.
echo.

call npm run dev

pause
