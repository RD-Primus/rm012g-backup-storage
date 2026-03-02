# RM-012-G Downloader - PowerShell Installer actions
# Called by install.cmd after files are copied to C:\RM012G_BackupStorage

$dest = "C:\RM012G_BackupStorage"
$ps1 = "$dest\scripts\launcher.ps1"
$desktop = [Environment]::GetFolderPath("Desktop")

# 1. Create Shortcut
Write-Host "  [..] Creating desktop shortcut ..."
try {
    $wshell = New-Object -ComObject WScript.Shell
    $shortcut = $wshell.CreateShortcut("$desktop\RM-012-G Downloader.lnk")
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
    $shortcut.WorkingDirectory = $dest
    $shortcut.WindowStyle = 1
    $shortcut.IconLocation = "C:\Windows\System32\imageres.dll,109"
    $shortcut.Description = "RM-012-G Downloader Control Panel"
    $shortcut.Save()
    Write-Host "  [OK] Shortcut created on Desktop" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Shortcut creation failed: $_" -ForegroundColor Yellow
}

Write-Host ""

# 2. Check and Generate SECURITY_TOKEN
Write-Host "  [..] Checking SECURITY_TOKEN ..."
$tokenFile = "$dest\.config\SECURITY_TOKEN"
if (-not (Test-Path $tokenFile)) {
    # Generate 32 char random alphanumeric string
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    $token = -join ((1..32) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    
    if (-not (Test-Path "$dest\.config")) {
        New-Item -ItemType Directory -Force -Path "$dest\.config" | Out-Null
    }
    
    Set-Content -Path $tokenFile -Value $token -NoNewline
    Write-Host "  [OK] Generated new 32-character SECURITY_TOKEN." -ForegroundColor Green
} else {
    Write-Host "  [OK] SECURITY_TOKEN exists." -ForegroundColor Green
}

Write-Host ""

# 3. Check Credentials
Write-Host "  [..] Checking credentials ..."
$credFile = "$dest\.config\credentials"
$exampleFile = "$dest\.config\credentials.example"

if (-not (Test-Path $credFile)) {
    if (Test-Path $exampleFile) {
        Copy-Item $exampleFile $credFile
    }
    Write-Host "  [WARN] credentials not found. Let's set it up now!" -ForegroundColor Yellow
    Write-Host "--------------------------------------------------------"
    Push-Location $dest
    node scripts\encrypt-password.js
    Pop-Location
    Write-Host "--------------------------------------------------------"
} else {
    Write-Host "  [OK] credentials exists." -ForegroundColor Green
}

