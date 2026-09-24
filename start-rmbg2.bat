@echo off
setlocal EnableDelayedExpansion
title PureCut - RMBG-2.0 Local Lab (CPU)
cd /d "%~dp0"

echo =======================================================
echo       PureCut - RMBG-2.0 Local Lab (CPU only)
echo =======================================================
echo.
echo  Runs the real briaai/RMBG-2.0 checkpoint on THIS machine.
echo  It cannot run in a browser - see the note at the end.
echo.

REM ---------------------------------------------------------------
REM 1. Node.js
REM ---------------------------------------------------------------
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your PATH.
    echo         Install it from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

REM ---------------------------------------------------------------
REM 2. App dependencies (the folder can exist but be empty, which
REM    `if not exist "node_modules\"` in start.bat does not catch).
REM ---------------------------------------------------------------
if not exist "node_modules\.bin\" (
    echo [INFO] Installing app dependencies...
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

REM ---------------------------------------------------------------
REM 3. The two NATIVE dependencies this lab needs.
REM    Deliberately NOT installed by `npm install`: the app is
REM    100 percent client-side and must not pull a server-side ONNX
REM    runtime. onnxruntime-node is what makes RMBG-2.0 loadable.
REM ---------------------------------------------------------------
set "NEED_INSTALL=0"
if not exist "node_modules\onnxruntime-node\package.json" set "NEED_INSTALL=1"
if not exist "node_modules\sharp\package.json"          set "NEED_INSTALL=1"

if "!NEED_INSTALL!"=="1" (
    echo.
    echo [INFO] First-time setup: installing the Node-only lab dependencies.
    echo        onnxruntime-node ~ 100 MB ^(CPU only, no GPU binary^)
    echo        sharp            ~  30 MB
    echo.
    call npm install -D onnxruntime-node --cpu
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Could not install onnxruntime-node.
        pause
        exit /b 1
    )
    call npm install -D sharp
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Could not install sharp.
        pause
        exit /b 1
    )
)

REM ---------------------------------------------------------------
REM 4. Hugging Face token.
REM    briaai/RMBG-2.0 is gated ("auto"), so there is NO anonymous
REM    download path. Without a token the run fails with HTTP 401.
REM ---------------------------------------------------------------
set "HAVE_TOKEN=0"
if defined HF_TOKEN set "HAVE_TOKEN=1"
if exist ".env" findstr /R /C:"^[ ]*HF_TOKEN[ ]*=" ".env" >nul 2>nul && set "HAVE_TOKEN=1"

if "!HAVE_TOKEN!"=="0" (
    echo.
    echo [ERROR] No Hugging Face token found, and briaai/RMBG-2.0 is GATED.
    echo.
    echo         1. Accept the licence at:
    echo            https://huggingface.co/briaai/RMBG-2.0
    echo            ^(non-commercial: personal / academy / non-profit^)
    echo         2. Create a READ token at:
    echo            https://huggingface.co/settings/tokens
    echo         3. Create a file named .env next to this script ^(it is
    echo            gitignored^) containing exactly one line:
    echo                HF_TOKEN=hf_your_token_here
    echo.
    echo         Then run this launcher again.
    echo.
    pause
    exit /b 1
)

REM ---------------------------------------------------------------
REM 5. Make sure there is something to process.
REM    Not failure handling - if the folder is empty the runner
REM    creates four synthetic samples on its own, so the FIRST run
REM    always produces a visible result before you add your own.
REM ---------------------------------------------------------------
if not exist "rmbg2-lab\inputs\*" (
    echo [INFO] rmbg2-lab\inputs is empty.
    echo        Four synthetic samples will be generated so you can see
    echo        the model work. Drop your own images in afterwards.
    echo.
    call :OpenFolder "rmbg2-lab\inputs"
)

REM ---------------------------------------------------------------
REM 6. Launch the GUI
REM    This launcher opens the point-and-click page. The terminal-only
REM    version is start-rmbg2-cmd.bat.
REM ---------------------------------------------------------------
echo.
echo [INFO] Starting the RMBG-2.0 GUI lab.
echo.
echo   Your browser will open at http://localhost:5173/rmbg2
echo   There you can drop in images, tick which ones to run, and choose
echo   the checkpoint and the execution provider.
echo.
echo   Before the first run on a fresh checkpoint, expect a download:
echo     q4f16  223 MB     fp16  490 MB     fp32  977 MB
echo   Once downloaded the weights are cached in rmbg2-lab\.cache\ and
echo   reused, so later runs start straight away. To get that download
echo   out of the way now, use:  npm run rmbg2:preload
echo.
echo   Prefer the terminal version instead? Run start-rmbg2-cmd.bat
echo.
echo Press Ctrl+C in this terminal to stop the server.
echo.

call npm run rmbg2:lab
set "RUN_EXIT=!ERRORLEVEL!"

echo.
if not "!RUN_EXIT!"=="0" (
    echo [ERROR] The lab server exited with code !RUN_EXIT!.
    echo         If a port clash is the cause, close the other dev server
    echo         ^(or the other copy of this launcher^) and try again.
)
echo.
pause
exit /b 0

REM ======================= helpers =======================

:OpenFolder
if exist %1 start "" explorer "%CD%\%~1"
exit /b

:OpenFile
if exist %1 start "" "%CD%\%~1"
exit /b