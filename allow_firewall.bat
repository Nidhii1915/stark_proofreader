@echo off
title Stark Proofreader - Firewall Setup
echo ========================================================
echo   Configuring Windows Firewall for Stark Proofreader
echo ========================================================
echo.
netsh advfirewall firewall add rule name="Stark Proofreader Port 8000" dir=in action=allow protocol=TCP localport=8000 profile=any
echo.
if %errorlevel% equ 0 (
    echo [SUCCESS] Inbound Port 8000 is now open!
    echo Teammates on your Wi-Fi can now open:
    echo.
    echo       http://192.168.1.31:8000
    echo.
) else (
    echo [NOTE] If you saw an elevation error above, please right-click 
    echo        this file and choose "Run as administrator".
)
echo.
pause
