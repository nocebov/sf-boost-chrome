@echo off
setlocal

set CDP_PORT=9222
set PROFILE_DIR=%TEMP%\chrome-sf-boost-dev
set EXT_PATH=%~dp0.output\chrome-mv3

:: Знаходимо Brave або Chrome
set CHROME_EXE=
if exist "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    set CHROME_EXE=%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe
) else if exist "%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    set CHROME_EXE=%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe
) else if exist "%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe" (
    set CHROME_EXE=%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
)

if "%CHROME_EXE%"=="" (
    echo [ERROR] Brave або Chrome не знайдено. Встанови один з браузерів.
    exit /b 1
)

if not exist "%EXT_PATH%" (
    echo [INFO] .output\chrome-mv3 не знайдено. Збираємо...
    call bun run build
    if errorlevel 1 (
        echo [ERROR] Збiрка завершилась з помилкою.
        exit /b 1
    )
)

echo.
echo  Запускаємо Chrome...
echo  Debug port : %CDP_PORT%
echo  Профiль    : %PROFILE_DIR%
echo  Розширення : %EXT_PATH%
echo.
echo  Пiсля запуску:
echo   1. Вiдкрий chrome://extensions
echo   2. Скопiюй ID розширення SF Boost
echo   3. Створи .env.local: EXTENSION_ID=^<id^>
echo   4. Тепер: bun run build:reload
echo.

start "" "%CHROME_EXE%" --remote-debugging-port=%CDP_PORT% --load-extension="%EXT_PATH%" --user-data-dir="%PROFILE_DIR%"

echo  Chrome запущено!
