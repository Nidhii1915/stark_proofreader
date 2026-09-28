@echo off
title Push Stark Proofreader to GitHub
cd /d "%~dp0"
echo ========================================================
echo   Pushing Stark Proofreader to GitHub:
echo   https://github.com/Nidhii1915/stark_proofreader
echo ========================================================
echo.
echo If a GitHub sign-in window appears in your browser,
echo please click "Authorize" or sign in.
echo.
git push -u origin main
echo.
if %errorlevel% equ 0 (
    echo ========================================================
    echo [SUCCESS] Code pushed to GitHub successfully!
    echo Render will now automatically start building your app!
    echo ========================================================
) else (
    echo [NOTE] If there was an error, make sure you are signed into GitHub.
)
echo.
pause
