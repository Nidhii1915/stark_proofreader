# Stark Proofreader AI - PowerShell Launcher
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "========================================================" -ForegroundColor Red
Write-Host "     Stark Proofreader AI - Stark Premium Intelligence  " -ForegroundColor Red
Write-Host "========================================================" -ForegroundColor Red
Write-Host ""

if (-not (Test-Path "$ScriptDir\venv\Scripts\Activate.ps1")) {
    Write-Host "[INFO] Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
    & "$ScriptDir\venv\Scripts\Activate.ps1"
    Write-Host "[INFO] Installing dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt
} else {
    & "$ScriptDir\venv\Scripts\Activate.ps1"
}

Write-Host ""
Write-Host "[INFO] Server starting on http://localhost:8000" -ForegroundColor Green
Write-Host "[INFO] Teammates can connect via your network IP on port 8000:" -ForegroundColor Green

Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*","Ethernet*" 2>$null | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | ForEach-Object {
    Write-Host "       --> http://$($_.IPAddress):8000" -ForegroundColor Cyan
}

Start-Process "http://localhost:8000"
Write-Host ""
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
