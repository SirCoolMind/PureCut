@echo off
setlocal EnableDelayedExpansion
title PureCut - RMBG-2.0 Local Lab (terminal)
cd /d "%~dp0"

echo =======================================================
echo    PureCut - RMBG-2.0 Local Lab (terminal version)
echo =======================================================
echo.
echo  Runs the real briaai/RMBG-2.0 checkpoint on this machine
echo  and writes the results to rmbg2-lab\outputs\.
echo.
echo  Want the point-and-click version instead? start-rmbg2.bat
echo.

REM ---------------------------------------------------------------
REM Prerequisites (same guards as start-rmbg2.bat)
REM ---------------------------------------------------------------
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your PATH.
    echo         Install it from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\.bin\" (
    echo [INFO] Installing app dependencies...
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

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

REM ===============================================================
REM STEP 1 - tell the user where to put their images
REM ===============================================================
if not exist "rmbg2-lab\inputs" mkdir "rmbg2-lab\inputs"

echo.
echo ---------------------------------------------------------------
echo  STEP 1 of 2  -  Put your images here
echo ---------------------------------------------------------------
echo.
echo     %CD%\rmbg2-lab\inputs
echo.
echo  Copy or drag your photos into that folder. Any of these work:
echo    .png  .jpg  .jpeg  .webp  .avif  .tif  .tiff  .gif  .bmp
echo.
echo  An Explorer window will open at the folder.
echo.
echo  Already have images there? Press Enter and they will be picked up.
echo.

start "" explorer "%CD%\rmbg2-lab\inputs"

REM `set /p` rather than `pause` for this wait, deliberately.
REM
REM `pause` and a later `set /p` compete for the same input stream: when stdin is
REM redirected, `pause` swallows the WHOLE stream and the confirmation prompt below
REM then reads an empty string and silently cancels the run. Interactively that does
REM not happen (pause takes one key), but using `set /p` for both waits removes the
REM trap entirely, and makes the script testable without a console.
set /p "READY=Press Enter when your images are in the folder... "

REM ===============================================================
REM STEP 2 - count, confirm, run
REM ===============================================================
set "COUNT=0"
set "NAMES="
for %%F in ("rmbg2-lab\inputs\*.png" "rmbg2-lab\inputs\*.jpg" "rmbg2-lab\inputs\*.jpeg" "rmbg2-lab\inputs\*.webp" "rmbg2-lab\inputs\*.avif" "rmbg2-lab\inputs\*.tif" "rmbg2-lab\inputs\*.tiff" "rmbg2-lab\inputs\*.gif" "rmbg2-lab\inputs\*.bmp") do (
    if exist "%%~fF" (
        set /a COUNT+=1
        set "NAMES=!NAMES!%%~nxF "
    )
)

echo.
echo ---------------------------------------------------------------
echo  STEP 2 of 2  -  Confirm
echo ---------------------------------------------------------------
echo.

if "!COUNT!"=="0" (
    echo     No images found in rmbg2-lab\inputs
    echo.
    echo     Four synthetic samples will be generated so you can see the
    echo     model work, and the run will continue without them.
    echo.
    set /p "GO=Run on the synthetic samples? [Y/N]: "
) else (
    echo     Found !COUNT! image^(s^):
    echo.
    call :ListNames
    echo.
    echo     Output goes to: rmbg2-lab\outputs\
    echo       ^<name^>-cutout.png   transparent cutout
    echo       ^<name^>-mask.png     raw alpha mask
    echo       report.html          side-by-side report
    echo.
    set /p "GO=Run RMBG-2.0 on these !COUNT! image^(s^)? [Y/N]: "
)

if /i not "!GO!"=="Y" (
    echo.
    echo Cancelled - nothing was run.
    echo.
    pause
    exit /b 0
)

echo.
echo ---------------------------------------------------------------
echo  Running
echo ---------------------------------------------------------------
echo.
echo   The first run on a checkpoint downloads it ^(223 MB for q4f16,
echo   490 MB for fp16, 977 MB for fp32^). After that the weights are
echo   cached in rmbg2-lab\.cache\ and reused, so later runs start
echo   straight away.
echo.
echo   Session load takes about 25 s, then roughly 16-20 s per image on
echo   CPU at 1024x1024. It uses a lot of RAM - that is expected.
echo.
echo Press Ctrl+C in this terminal to stop.
echo.

call npm run rmbg2
set "RUN_EXIT=!ERRORLEVEL!"

echo.
if "!RUN_EXIT!"=="0" (
    echo [OK] Finished. Opening the report...
    call :OpenFile "rmbg2-lab\outputs\report.html"
) else (
    echo [ERROR] The run failed. Read the message above - the common ones are:
    echo         HTTP 401 / 403  -^> the token was not accepted, or the licence
    echo                             has not been accepted for that account
    echo         protobuf error  -^> truncated download; run again to refetch
    echo         out of memory   -^> try the smaller checkpoint:
    echo                             npm run rmbg2 -- --checkpoint=onnx/model_q4f16.onnx
    if exist "rmbg2-lab\outputs\report.html" call :OpenFile "rmbg2-lab\outputs\report.html"
)

echo.
echo -------------------------------------------------------
echo  Why not in the browser?
echo.
echo  RMBG-2.0's ONNX export cannot be loaded by onnxruntime-web
echo  at all: it fails at session creation with
echo    ShapeInferenceError: inferred=4 declared=6
echo  and the WASM build hardcodes strict shape inference, so no
echo  setting works around it. The same file loads fine in Node,
echo  which is exactly what this lab uses. The PureCut studio
echo  itself ships only browser-capable models.
echo -------------------------------------------------------
echo.
pause
exit /b 0

REM ======================= helpers =======================

REM Prints the collected filenames in rows of four, so a long list stays readable.
:ListNames
set "LINE=     "
set "N=0"
for %%F in (!NAMES!) do (
    set "LINE=!LINE!%%F   "
    set /a N+=1
    if !N! GEQ 4 (
        echo !LINE!
        set "LINE=     "
        set "N=0"
    )
)
if not "!LINE!"=="     " echo !LINE!
exit /b

:OpenFile
if exist %1 start "" "%CD%\%~1"
exit /b