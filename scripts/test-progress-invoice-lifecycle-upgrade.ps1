[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$scriptRoot = Split-Path -Parent $PSCommandPath
$repoRoot = [IO.Path]::GetFullPath((Join-Path $scriptRoot '..'))
$wrapper = Join-Path $scriptRoot 'run-local-supabase.ps1'
$powerShellArgs = @(
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  $wrapper
)

function Assert-LocalGuard {
  $guardOutput = @(& powershell.exe @powerShellArgs env guard 2>&1)
  $guardExitCode = $LASTEXITCODE
  $guardToken = ($guardOutput -join "`n").Trim()
  if ($guardExitCode -ne 0 -or $guardToken -ne 'LOCAL_OK') {
    throw "The local Supabase environment guard refused the upgrade test (exit $guardExitCode, token $guardToken)."
  }
}

function Invoke-LocalCommand {
  param([string[]]$Arguments)

  Assert-LocalGuard
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $commandOutput = @(& powershell.exe @powerShellArgs @Arguments 2>&1)
  $commandExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference

  return [PSCustomObject]@{
    ExitCode = $commandExitCode
    Text = ($commandOutput -join "`n")
  }
}

function Invoke-SuccessfulLocalCommand {
  param([string[]]$Arguments)

  $result = Invoke-LocalCommand -Arguments $Arguments
  if ($result.ExitCode -ne 0) {
    throw "A guarded local Supabase command failed with exit code $($result.ExitCode)."
  }
}

$testFailure = $null

try {
  Invoke-SuccessfulLocalCommand -Arguments @('db', 'reset', '--local', '--version', '20260719225144')
  Invoke-SuccessfulLocalCommand -Arguments @(
    'test', 'db', '--local',
    'supabase/tests/progress_invoice_lifecycle_upgrade_seed.sql'
  )
  Invoke-SuccessfulLocalCommand -Arguments @('migration', 'up', '--local')
  Invoke-SuccessfulLocalCommand -Arguments @(
    'test', 'db', '--local',
    'supabase/tests/progress_invoice_lifecycle_upgrade_verify.sql'
  )

  Invoke-SuccessfulLocalCommand -Arguments @('db', 'reset', '--local', '--version', '20260719225144')
  Invoke-SuccessfulLocalCommand -Arguments @(
    'test', 'db', '--local',
    'supabase/tests/progress_invoice_lifecycle_upgrade_duplicate_seed.sql'
  )

  $duplicateResult = Invoke-LocalCommand -Arguments @('migration', 'up', '--local')
  if ($duplicateResult.ExitCode -eq 0) {
    throw 'The duplicate numbering-base migration unexpectedly succeeded.'
  }
  if ($duplicateResult.Text -notmatch 'PROGRESS_NUMBERING_BASE_DUPLICATE_PREFLIGHT') {
    throw 'The duplicate numbering-base migration failed without the expected preflight error.'
  }

  Invoke-SuccessfulLocalCommand -Arguments @(
    'test', 'db', '--local',
    'supabase/tests/progress_invoice_lifecycle_upgrade_rollback_verify.sql'
  )
} catch {
  $testFailure = $_
}

try {
  Invoke-SuccessfulLocalCommand -Arguments @('db', 'reset', '--local')
} catch {
  if ($null -eq $testFailure) {
    $testFailure = $_
  }
}

if ($null -ne $testFailure) {
  throw $testFailure
}

[Console]::Out.WriteLine('UPGRADE_TEST_OK')
