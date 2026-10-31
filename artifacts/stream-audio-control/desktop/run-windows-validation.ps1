$ErrorActionPreference = "Stop"
$reportDir = Join-Path $env:RUNNER_TEMP "desktop-validation"
New-Item -ItemType Directory -Force $reportDir | Out-Null
$release = Join-Path $PSScriptRoot "..\release"
$installers = @(Get-ChildItem $release -Filter "*.exe")
if ($installers.Count -ne 1) { throw "Expected exactly one Windows installer" }
$node = (Get-Command node).Source
$userName = "SACDesktopTest"
$account = "$env:COMPUTERNAME\$userName"
$shared = Join-Path $env:PUBLIC ("DesktopValidation-" + [Guid]::NewGuid().ToString("N"))
# UAC is disabled on some hosted images: RunLevel Limited on runneradmin still
# has administrator rights. Use a genuinely new standard user and its own HKCU.
# This ephemeral VM-only password is generated in memory and never logged.
$password = [Guid]::NewGuid().ToString("N") + "aA1!"
$createdUser = $false
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
  $arguments = (
    "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Installer `"$(Join-Path $shared 'installer.exe')`" -Node `"$(Join-Path $shared 'node.exe')`" -ReportDirectory `"$sharedReports`""
  )
  $credential = [PSCredential]::new($account, (ConvertTo-SecureString $password -AsPlainText -Force))
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WorkingDirectory $shared -Credential $credential -LoadUserProfile -PassThru -RedirectStandardOutput (Join-Path $sharedReports "launcher-stdout.log") -RedirectStandardError (Join-Path $sharedReports "launcher-stderr.log")
  if (-not $process.WaitForExit(360000)) {
    $process.Kill()
    throw "Standard-user validation process timed out"
  }
  if ($process.ExitCode -ne 0 -or -not (Test-Path (Join-Path $sharedReports "windows-result.txt"))) {
    Get-ChildItem $sharedReports -Filter "*.log" | Get-Content
    Get-ChildItem $sharedReports -Filter "*.txt" | Get-Content
    throw "Standard-user Windows validation failed (exit $($process.ExitCode))"
  }
  Get-Content (Join-Path $sharedReports "windows-result.txt")
} finally {
  if (Test-Path (Join-Path $shared "reports")) {
    Copy-Item (Join-Path $shared "reports\*") $reportDir -Force
  }
  if ($createdUser) { Remove-LocalUser -Name $userName }
  if (Test-Path $shared) { Remove-Item $shared -Recurse -Force }
  $password = $null
}
