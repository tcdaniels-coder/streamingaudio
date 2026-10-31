param(
  [Parameter(Mandatory)][string]$Installer,
  [Parameter(Mandatory)][string]$Node,
  [Parameter(Mandatory)][string]$ReportDirectory
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Start-Transcript -Path (Join-Path $ReportDirectory "windows-install.log")

function Require($Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}
function Run-Installer([string]$Executable, [string[]]$Arguments) {
  $process = Start-Process -FilePath $Executable -ArgumentList $Arguments -PassThru
  if (-not $process.WaitForExit(120000)) {
    $process.Kill()
    throw "Installer/uninstaller timed out"
  }
  Require ($process.ExitCode -eq 0) "Installer/uninstaller exit code: $($process.ExitCode)"
}

$exitCode = 1
try {
  $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
  Require (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) "Test must run with an unelevated, per-user token"
  # CreateProcessWithLogon may inherit the invoking account's environment.
  # Resolve the loaded profile by the ACTUAL token, not inherited APPDATA.
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $profile = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid").ProfileImagePath
  $env:USERPROFILE = [Environment]::ExpandEnvironmentVariables($profile)
  $env:LOCALAPPDATA = Join-Path $env:USERPROFILE "AppData\Local"
  $env:APPDATA = Join-Path $env:USERPROFILE "AppData\Roaming"
  $env:TEMP = Join-Path $env:LOCALAPPDATA "Temp"
  $env:TMP = $env:TEMP
  New-Item -ItemType Directory -Force $env:TEMP | Out-Null
  Write-Output "Validated standard-user token and loaded a clean profile"
  $installDir = Join-Path $env:LOCALAPPDATA "Programs\Stream Audio Control"
  $desktopLink = Join-Path ([Environment]::GetFolderPath("Desktop")) "Stream Audio Control.lnk"
  $startMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Stream Audio Control"
  $registrySuffix = "Software\Microsoft\Windows\CurrentVersion\Uninstall\StreamAudioControl"
  $registryKey = "HKCU:\$registrySuffix"
  $machineKey = "HKLM:\$registrySuffix"
  foreach ($item in @($installDir, $desktopLink, $startMenuDir, $registryKey, $machineKey,
      (Join-Path $env:APPDATA "Stream Audio Control"),
      (Join-Path $env:APPDATA "@workspace\stream-audio-control"))) {
    Require (-not (Test-Path $item)) "Runner is not clean: $item already exists"
  }
  Run-Installer $Installer @("/S")
  $appExe = Join-Path $installDir "Stream Audio Control.exe"
  $uninstaller = Join-Path $installDir "Uninstall.exe"
  Require (Test-Path $appExe) "App was not installed in the per-user Programs folder"
  Require (Test-Path $uninstaller) "Uninstaller missing"
  Require (Test-Path $desktopLink) "Desktop shortcut missing"
  Require (Test-Path (Join-Path $startMenuDir "Stream Audio Control.lnk")) "Start menu shortcut missing"
  $registration = Get-ItemProperty $registryKey
  Require ($registration.InstallLocation -eq $installDir) "Uninstall registration has the wrong install location"
  Require ($registration.UninstallString -eq "`"$uninstaller`"") "Uninstall registration has the wrong command"
  Require (-not (Test-Path $machineKey)) "Per-user installer unexpectedly registered machine-wide"

  $shell = New-Object -ComObject WScript.Shell
  foreach ($link in @($desktopLink, (Join-Path $startMenuDir "Stream Audio Control.lnk"))) {
    Require ($shell.CreateShortcut($link).TargetPath -eq $appExe) "Shortcut points to the wrong executable"
  }
  & $Node (Join-Path $PSScriptRoot "test-packaged-app.mjs") $appExe "x64" (Join-Path $ReportDirectory "windows-smoke.json")
  Require ($LASTEXITCODE -eq 0) "Installed app smoke check failed"

  Run-Installer $uninstaller @("/S")
  # NSIS relaunches its uninstaller from TEMP to delete the original executable.
  # Wait for actual cleanup, not just the launching process; never clean up the
  # files ourselves, which would hide an uninstall regression.
  $deadline = (Get-Date).AddSeconds(60)
  while ((Test-Path $installDir) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  foreach ($item in @($installDir, $desktopLink, $startMenuDir, $registryKey, $machineKey)) {
    Require (-not (Test-Path $item)) "Uninstall left behind: $item"
  }
  # Electron preferences/cache intentionally remain; uninstall must not erase
  # operator data. Installed program files, shortcuts and registration must go.
  "PASS: clean per-user install, unelevated launch, bridge, shortcuts, and uninstall" |
    Set-Content (Join-Path $ReportDirectory "windows-result.txt")
  $exitCode = 0
} catch {
  $_ | Out-String | Set-Content (Join-Path $ReportDirectory "windows-failure.txt")
  Write-Error $_ -ErrorAction Continue
} finally {
  Stop-Transcript
}
exit $exitCode
