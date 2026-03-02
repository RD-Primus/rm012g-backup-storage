' Starts Node.js server silently (no visible window)
' Working directory is set to the app root (parent of Scripts folder)
Dim shell, fso, scriptDir, appDir
Set shell  = CreateObject("WScript.Shell")
Set fso    = CreateObject("Scripting.FileSystemObject")

' Derive app root from location of this script
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
appDir    = fso.GetParentFolderName(scriptDir)

' Set working directory so require() paths resolve correctly
shell.CurrentDirectory = appDir

' Run node silently: window style 0 = hidden, bWaitOnReturn = False
shell.Run "cmd /c node server.js > NUL 2>&1", 0, False
