@echo off
title Stark Proofreader AI - Server
cd /d "%~dp0"

echo ========================================================
echo     Stark Proofreader AI - Stark Premium Intelligence
echo ========================================================
echo.

IF NOT EXIST "venv\Scripts\activate.bat" (
    echo [INFO] Virtual environment not found. Creating one...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo [INFO] Installing required dependencies...
    pip install -r requirements.txt
) ELSE (
    call venv\Scripts\activate.bat
)

echo.
echo [INFO] Server starting on http://localhost:8000
echo [INFO] Teammates on your local network / Wi-Fi can connect via your LAN IP:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /r /c:"IPv4 Address.*[0-9]*\.[0-9]*\.[0-9]*\.[0-9]*"') do (
    echo        --^> http:%%a:8000
)
echo.
echo Opening browser...
start http://localhost:8000

echo.
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
pause
