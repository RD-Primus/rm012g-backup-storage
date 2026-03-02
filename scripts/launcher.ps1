# RM-012-G Downloader - Desktop Launcher (WinForms Desktop UI)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$appDir = Split-Path $PSScriptRoot -Parent
$port   = 3003
$url    = "http://localhost:$port"
$vbs    = Join-Path $appDir "scripts\start-hidden.vbs"

function Stop-Server {
    $procs = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
             Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procs) {
        try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {}
    }
}

# --- GUI Setup ---
$form = New-Object System.Windows.Forms.Form
$form.Text = "RM-012-G Control Panel"
$form.Size = New-Object System.Drawing.Size(360, 320)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#1e1e1e")

# Title Label
$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "RM-012-G Downloader"
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$lblTitle.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#a855f7") # Purple
$lblTitle.AutoSize = $true
$lblTitle.Location = New-Object System.Drawing.Point(20, 20)
$form.Controls.Add($lblTitle)

# Subtitle / URL
$lblUrl = New-Object System.Windows.Forms.Label
$lblUrl.Text = $url
$lblUrl.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$lblUrl.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#94a3b8") # Slate 400
$lblUrl.AutoSize = $true
$lblUrl.Location = New-Object System.Drawing.Point(24, 50)
$form.Controls.Add($lblUrl)

# Status Label
$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$lblStatus.AutoSize = $true
$lblStatus.Location = New-Object System.Drawing.Point(24, 85)
$lblStatus.Text = "Status: CHECKING..."
$lblStatus.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#eab308")
$form.Controls.Add($lblStatus)

# Buttons
$btnAction1 = New-Object System.Windows.Forms.Button
$btnAction1.Size = New-Object System.Drawing.Size(140, 40)
$btnAction1.Location = New-Object System.Drawing.Point(20, 130)
$btnAction1.FlatStyle = "Flat"
$btnAction1.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($btnAction1)

$btnAction2 = New-Object System.Windows.Forms.Button
$btnAction2.Size = New-Object System.Drawing.Size(140, 40)
$btnAction2.Location = New-Object System.Drawing.Point(170, 130)
$btnAction2.FlatStyle = "Flat"
$btnAction2.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($btnAction2)

$btnRestart = New-Object System.Windows.Forms.Button
$btnRestart.Size = New-Object System.Drawing.Size(290, 40)
$btnRestart.Location = New-Object System.Drawing.Point(20, 180)
$btnRestart.FlatStyle = "Flat"
$btnRestart.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnRestart.Text = "Restart Server"
$btnRestart.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#eab308") # Yellow
$btnRestart.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#2d2d2d")
$form.Controls.Add($btnRestart)

$btnExit = New-Object System.Windows.Forms.Button
$btnExit.Size = New-Object System.Drawing.Size(290, 30)
$btnExit.Location = New-Object System.Drawing.Point(20, 230)
$btnExit.FlatStyle = "Flat"
$btnExit.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnExit.Text = "Close Control Panel"
$btnExit.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#94a3b8")
$btnExit.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#1e1e1e")
$form.Controls.Add($btnExit)

$global:isServerRunning = $false
$global:isChecking = $false
$global:statusOverride = $null

function Toggle-Buttons ([bool]$enabled) {
    if ($global:statusOverride -ne $null) { $enabled = $false }
    $btnAction1.Enabled = $enabled
    $btnAction2.Enabled = $enabled
    $btnRestart.Enabled = $enabled
}

function Render-UI {
    if ($global:statusOverride -ne $null) {
        $lblStatus.Text = $global:statusOverride
        $lblStatus.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#eab308")
        Toggle-Buttons $false
        return
    }

    Toggle-Buttons $true
    if ($global:isServerRunning) {
        $lblStatus.Text = "Status: RUNNING"
        $lblStatus.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#22c55e")

        $btnAction1.Text = "Open Browser"
        $btnAction1.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#06b6d4")
        $btnAction1.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#2d2d2d")

        $btnAction2.Text = "Stop Server"
        $btnAction2.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#ef4444")
        $btnAction2.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#2d2d2d")

        $btnRestart.Visible = $true
    } else {
        $lblStatus.Text = "Status: STOPPED"
        $lblStatus.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#ef4444")

        $btnAction1.Text = "Start Server"
        $btnAction1.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#22c55e")
        $btnAction1.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#2d2d2d")

        $btnAction2.Text = "Exit"
        $btnAction2.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#94a3b8")
        $btnAction2.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#2d2d2d")

        $btnRestart.Visible = $false
    }
}

# --- Async HTTP Check using Runspace ---
$syncHash = [hashtable]::Synchronized(@{})
$syncHash.url = $url

$runspace = [runspacefactory]::CreateRunspace()
$runspace.ApartmentState = "STA"
$runspace.ThreadOptions = "ReuseThread"
$runspace.Open()
$runspace.SessionStateProxy.SetVariable("syncHash", $syncHash)

$scriptBlock = {
    while ($true) {
        try {
            Invoke-WebRequest "$($syncHash.url)/api/auth/status" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop | Out-Null
            $syncHash.isRunning = $true
        } catch {
            $syncHash.isRunning = $false
        }
        Start-Sleep -Milliseconds 1500
    }
}

$pipeline = $runspace.CreatePipeline()
$pipeline.Commands.AddScript($scriptBlock) | Out-Null
$global:asyncHandle = $pipeline.InvokeAsync()

# Timer to just pull result from syncHash (Does not block UI)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
    if ($syncHash.isRunning -ne $null) {
        $global:isServerRunning = $syncHash.isRunning
    }
    Render-UI
})

# --- Event Handlers ---
$btnAction1.Add_Click({
    if ($global:isServerRunning) {
        Start-Process $url
    } else {
        if (-not (Test-Path $vbs)) {
            [System.Windows.Forms.MessageBox]::Show("Not installed. Run install.cmd first.", "Error", "OK", "Error")
            return
        }
        $global:statusOverride = "Starting..."
        Render-UI
        Start-Process "wscript.exe" -ArgumentList "`"$vbs`""
        
        $resetTimer = New-Object System.Windows.Forms.Timer
        $resetTimer.Interval = 4000
        $resetTimer.Add_Tick({
            $global:statusOverride = $null
            Render-UI
            Start-Process $url
            $this.Stop()
            $this.Dispose()
        })
        $resetTimer.Start()
    }
})

$btnAction2.Add_Click({
    if ($global:isServerRunning) {
        $global:statusOverride = "Stopping..."
        Render-UI
        Stop-Server
        
        $resetTimer = New-Object System.Windows.Forms.Timer
        $resetTimer.Interval = 2000
        $resetTimer.Add_Tick({
            $global:statusOverride = $null
            Render-UI
            $this.Stop()
            $this.Dispose()
        })
        $resetTimer.Start()
    } else {
        $form.Close()
    }
})

$btnRestart.Add_Click({
    $global:statusOverride = "Restarting..."
    Render-UI
    Stop-Server
    
    $runTimer = New-Object System.Windows.Forms.Timer
    $runTimer.Interval = 2000
    $runTimer.Add_Tick({
        Start-Process "wscript.exe" -ArgumentList "`"$vbs`""
        $this.Stop()
        $this.Dispose()
        
        $openTimer = New-Object System.Windows.Forms.Timer
        $openTimer.Interval = 4000
        $openTimer.Add_Tick({
            $global:statusOverride = $null
            Render-UI
            Start-Process $url
            $this.Stop()
            $this.Dispose()
        })
        $openTimer.Start()
    })
    $runTimer.Start()
})

$btnExit.Add_Click({
    $form.Close()
})


$form.Add_Load({
    Render-UI
    $timer.Start()
})

$form.Add_FormClosed({
    $timer.Stop()
    $timer.Dispose()
    if ($pipeline -ne $null) {
        try { $pipeline.Stop() } catch {}
        try { $pipeline.Dispose() } catch {}
    }
    if ($runspace -ne $null) {
        try { $runspace.Close() } catch {}
        try { $runspace.Dispose() } catch {}
    }
})

# Show the Form
[void]$form.ShowDialog()
