$ErrorActionPreference = "Stop"
$reportDir = Join-Path $env:RUNNER_TEMP "desktop-validation"
New-Item -ItemType Directory -Force $reportDir | Out-Null
$release = Join-Path $PSScriptRoot "..\release"
$installers = @(Get-ChildItem $release -Filter "*.exe")
if ($installers.Count -ne 1) { throw "Expected exactly one Windows installer" }
$node = (Get-Command node).Source
$script = Join-Path $PSScriptRoot "test-windows-install.ps1"
$taskName = "StreamAudioControl-NativeValidation"
# Hosted runners use an administrator account. A limited interactive task uses
# its unelevated token and real HKCU/profile, without UAC or a stored password.
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
  "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Installer `"$($installers[0].FullName)`" -Node `"$node`" -ReportDirectory `"$reportDir`""
)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 8)
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask $taskName
  $deadline = (Get-Date).AddMinutes(9)
  do {
    Start-Sleep -Seconds 2
    $info = Get-ScheduledTaskInfo $taskName
    $state = (Get-ScheduledTask $taskName).State
    if ((Get-Date) -gt $deadline) { throw "Unelevated validation task timed out" }
  } while ($info.LastRunTime.Year -lt 2020 -or $state -eq "Running" -or $state -eq "Queued")
  if ($info.LastTaskResult -ne 0 -or -not (Test-Path (Join-Path $reportDir "windows-result.txt"))) {
    Get-ChildItem $reportDir -Filter "*.txt" | Get-Content
    throw "Unelevated Windows validation failed (exit $($info.LastTaskResult))"
  }
  Get-Content (Join-Path $reportDir "windows-result.txt")
} finally {
  if (Get-ScheduledTask $taskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask $taskName -Confirm:$false
  }
}
