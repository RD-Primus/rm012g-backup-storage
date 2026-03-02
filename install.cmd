@echo off
:: ─────────────────────────────────────────────────────────
::  RM-012-G Downloader — Installer
::  Copies app to C:\RM012G_BackupStorage and creates desktop shortcut
:: ─────────────────────────────────────────────────────────
setlocal EnableDelayedExpansion

set "SRC=%~dp0"
set "SRC=%SRC:~0,-1%"
set "DEST=C:\RM012G_BackupStorage"
set "DESKTOP=%USERPROFILE%\Desktop"
set "PS1=%DEST%\scripts\launcher.ps1"

echo.
echo  =========================================
echo   RM-012-G Downloader Installer
echo  =========================================
echo.

:: ── Step 1: Check Node.js ─────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Please install from https://nodejs.org
    pause
    exit /b 1
)
echo  [OK] Node.js found

:: ── Step 2: Copy files ───────────────────────────────────
echo  [..] Copying to %DEST% ...
if not exist "%DEST%" mkdir "%DEST%"

:: Robocopy: copy all except node_modules, data folders, and .config
robocopy "%SRC%" "%DEST%" /E /XD node_modules data data2 data-qa1 data-qa2 data-dev0 data-dev1 data-dev2 .git .config /XF *.log /NFL /NDL /NJH /NJS /NC /NS >nul
echo  [OK] Files copied

:: ── Step 3: npm install ───────────────────────────────────
echo  [..] Installing npm packages ...
pushd "%DEST%"
call npm install --silent
if errorlevel 1 (
    echo  [ERROR] npm install failed
    popd
    pause
    exit /b 1
)
popd
echo  [OK] Packages installed

:: ── Step 4 & 5: Create shortcut and check credentials ──────
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\scripts\install.ps1"


:: ── Done ──────────────────────────────────────────────────
echo.
echo  =========================================
echo   Installation complete!
echo   Double-click the desktop shortcut to
echo   start/stop the RM-012-G Downloader.
echo  =========================================
echo.
pause
