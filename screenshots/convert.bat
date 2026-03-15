@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  Chrome Web Store Screenshot Converter
echo  Target: 1280x800 JPEG, no cropping
echo ============================================
echo.

cd /d "%~dp0"

set COUNT=0
set CONVERTED=0

REM Create temp directory
if not exist "_temp" mkdir "_temp"

REM Process all image files (png, jpg, jpeg, bmp, webp)
for %%f in (*.png *.jpg *.jpeg *.bmp *.webp) do (
    if /i not "%%f"=="convert.bat" (
        set /a COUNT+=1
        echo Processing: %%f

        set "NAME=%%~nf"

        ffmpeg -y -i "%%f" -vf "scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2:white" -q:v 2 "_temp\!NAME!.jpg" -loglevel error

        if !errorlevel! equ 0 (
            set /a CONVERTED+=1
            echo   OK: !NAME!.jpg
        ) else (
            echo   FAILED: %%f
        )
    )
)

if %COUNT% equ 0 (
    echo No image files found.
    rmdir "_temp" 2>nul
    goto :end
)

echo.
echo Deleting originals...

REM Delete all original image files
for %%f in (*.png *.jpg *.jpeg *.bmp *.webp) do (
    del "%%f" 2>nul
)

REM Move converted files from temp to current directory
move /y "_temp\*.jpg" . >nul 2>&1
rmdir "_temp" 2>nul

echo.
echo ============================================
echo  Done: %CONVERTED%/%COUNT% converted
echo ============================================

:end
endlocal
pause
