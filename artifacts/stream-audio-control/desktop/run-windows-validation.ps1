$ErrorActionPreference = "Stop"
$reportDir = Join-Path $env:RUNNER_TEMP "desktop-validation"
New-Item -ItemType Directory -Force $reportDir | Out-Null
$release = Join-Path $PSScriptRoot "..\release"
$installers = @(Get-ChildItem $release -Filter "*.exe")
if ($installers.Count -ne 1) { throw "Expected exactly one Windows installer" }
$node = (Get-Command node).Source
$taskName = "StreamAudioControl-NativeValidation"
$userName = "SACDesktopTest"
$account = "$env:COMPUTERNAME\$userName"
$shared = Join-Path $env:PUBLIC ("DesktopValidation-" + [Guid]::NewGuid().ToString("N"))
# UAC is disabled on some hosted images: RunLevel Limited on runneradmin still
# has administrator rights. Use a genuinely new standard user and its own HKCU.
# This ephemeral VM-only password is generated in memory and never logged.
$password = [Guid]::NewGuid().ToString("N") + "aA1!"
$createdUser = $false
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 8)
try {
  New-LocalUser -Name $userName -Password (ConvertTo-SecureString $password -AsPlainText -Force) -AccountNeverExpires | Out-Null
  $createdUser = $true
  $usersGroup = Get-LocalGroup -SID "S-1-5-32-545"
  Add-LocalGroupMember -Group $usersGroup -Member $userName
  New-Item -ItemType Directory $shared | Out-Null
  Copy-Item $installers[0].FullName (Join-Path $shared "installer.exe")
  Copy-Item $node (Join-Path $shared "node.exe")
  Copy-Item (Join-Path $PSScriptRoot "test-windows-install.ps1") $shared
  Copy-Item (Join-Path $PSScriptRoot "test-packaged-app.mjs") $shared
  $sharedReports = Join-Path $shared "reports"
  New-Item -ItemType Directory $sharedReports | Out-Null
  & icacls.exe $shared /grant "${account}:(OI)(CI)M" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not grant the test user access to test fixtures" }
  $script = Join-Path $shared "test-windows-install.ps1"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $shared -Argument (
    "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Installer `"$(Join-Path $shared 'installer.exe')`" -Node `"$(Join-Path $shared 'node.exe')`" -ReportDirectory `"$sharedReports`""
  )
  Register-ScheduledTask -TaskName $taskName -Action $action -User $account -Password $password -RunLevel Limited -Settings $settings -Force | Out-Null
  Start-ScheduledTask $taskName
  $deadline = (Get-Date).AddMinutes(9)
  do {
    Start-Sleep -Seconds 2
    $info = Get-ScheduledTaskInfo $taskName
    $state = (Get-ScheduledTask $taskName).State
    if ((Get-Date) -gt $deadline) { throw "Unelevated validation task timed out" }
  } while ($info.LastRunTime.Year -lt 2020 -or $state -eq "Running" -or $state -eq "Queued")
  if ($info.LastTaskResult -ne 0 -or -not (Test-Path (Join-Path $sharedReports "windows-result.txt"))) {
    Get-ChildItem $sharedReports -Filter "*.txt" | Get-Content
    throw "Unelevated Windows validation failed (exit $($info.LastTaskResult))"
  }
  Get-Content (Join-Path $sharedReports "windows-result.txt")
} finally {
  if (Get-ScheduledTask $taskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask $taskName -Confirm:$false
  }
  if (Test-Path (Join-Path $shared "reports")) {
    Copy-Item (Join-Path $shared "reports\*") $reportDir -Force
  }
  if ($createdUser) { Remove-LocalUser -Name $userName }
  if (Test-Path $shared) { Remove-Item $shared -Recurse -Force }
  $password = $null
}
