# RM-012-G Downloader - Desktop Launcher
# Shows a Start/Stop/Open/Exit control panel

# Auto-detect app root: parent of the scripts folder this .ps1 lives in
$appDir = Split-Path $PSScriptRoot -Parent
$port   = 3003
$url    = "http://localhost:$port"
$vbs    = Join-Path $appDir "scripts\start-hidden.vbs"

function Get-ServerRunning {
    try {
        Invoke-WebRequest "$url/api/auth/status" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop | Out-Null
        return $true
    } catch { return $false }
}

function Stop-Server {
    $procs = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
             Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procs) {
        try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {}
    }
}

function Draw-Screen {
    Clear-Host
    $sep = "=" * 54
    Write-Host ""
    Write-Host "  $sep" -ForegroundColor DarkMagenta
    Write-Host "    RM-012-G Downloader  -  Control Panel" -ForegroundColor Magenta
    Write-Host "    $url" -ForegroundColor DarkCyan
    Write-Host "  $sep" -ForegroundColor DarkMagenta
    Write-Host ""

    $running = Get-ServerRunning
    if ($running) {
        Write-Host "  Status: [ RUNNING ]" -ForegroundColor Green
    } else {
        Write-Host "  Status: [ STOPPED ]" -ForegroundColor Red
    }
    Write-Host ""
    return $running
}

# Main loop
while ($true) {
    $running = Draw-Screen

    if ($running) {
        Write-Host "  [1] Open Browser"    -ForegroundColor Cyan
        Write-Host "  [2] Stop Server"     -ForegroundColor Red
        Write-Host "  [3] Restart Server"  -ForegroundColor Yellow
        Write-Host "  [4] Exit (keep server running)" -ForegroundColor DarkGray
    } else {
        Write-Host "  [1] Start Server"  -ForegroundColor Green
        Write-Host "  [2] Exit"          -ForegroundColor DarkGray
    }

    Write-Host ""
    $choice = Read-Host "  Select"

    if ($running) {
        switch ($choice) {
            "1" { Start-Process $url }
            "2" {
                Stop-Server
                Write-Host "  Stopping..." -ForegroundColor Yellow
                Start-Sleep 2
            }
            "3" {
                Stop-Server
                Start-Sleep 2
                Start-Process "wscript.exe" -ArgumentList $vbs
                Write-Host "  Restarting..." -ForegroundColor Yellow
                Start-Sleep 4
                Start-Process $url
            }
            "4" { exit 0 }
        }
    } else {
        switch ($choice) {
            "1" {
                if (-not (Test-Path $vbs)) {
                    Write-Host "  [ERROR] Not installed. Run install.cmd first." -ForegroundColor Red
                    Start-Sleep 3
                } else {
                    Start-Process "wscript.exe" -ArgumentList $vbs
                    Write-Host "  Starting server..." -ForegroundColor Yellow
                    Start-Sleep 4
                    Start-Process $url
                }
            }
            "2" { exit 0 }
        }
    }
}
