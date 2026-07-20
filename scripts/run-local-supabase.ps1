[CmdletBinding()]
param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
  [string[]]$CommandArgs
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Stop-LocalRefused {
  [Console]::Out.WriteLine('LOCAL_REFUSED')
  exit 1
}

function Test-ExactArgs {
  param(
    [string[]]$Actual,
    [string[]]$Expected
  )

  if ($Actual.Count -ne $Expected.Count) {
    return $false
  }

  for ($index = 0; $index -lt $Actual.Count; $index += 1) {
    if (-not [string]::Equals($Actual[$index], $Expected[$index], [StringComparison]::OrdinalIgnoreCase)) {
      return $false
    }
  }

  return $true
}

function Assert-LocalStack {
  $label = 'com.supabase.cli.project=progress-invoice-series'
  $rows = @(& docker.exe ps --filter "label=$label" --format '{{.Names}}|{{.Ports}}' 2>$null)

  if ($LASTEXITCODE -ne 0 -or $rows.Count -eq 0) {
    Stop-LocalRefused
  }

  foreach ($row in $rows) {
    $name = ($row -split '\|', 2)[0]
    if ($name -notmatch '^supabase_[a-z0-9_-]+_progress-invoice-series$') {
      Stop-LocalRefused
    }
  }

  $database = @($rows | Where-Object { $_ -match '^supabase_db_progress-invoice-series\|' })
  $gateway = @($rows | Where-Object { $_ -match '^supabase_kong_progress-invoice-series\|' })

  if ($database.Count -ne 1 -or $database[0] -notmatch ':54322->5432/tcp') {
    Stop-LocalRefused
  }
  if ($gateway.Count -ne 1 -or $gateway[0] -notmatch ':54321->8000/tcp') {
    Stop-LocalRefused
  }
}

function ConvertFrom-StatusEnv {
  param([object[]]$Lines)

  $values = @{}
  foreach ($lineObject in $Lines) {
    $line = [string]$lineObject
    if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') {
      $value = $Matches[2]
      if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $values[$Matches[1]] = $value
    }
  }

  return $values
}

function Test-LocalEndpoints {
  param([hashtable]$Values)

  if (-not $Values.ContainsKey('NEXT_PUBLIC_SUPABASE_URL') -or -not $Values.ContainsKey('SUPABASE_DB_URL')) {
    return $false
  }

  try {
    $api = [Uri]$Values['NEXT_PUBLIC_SUPABASE_URL']
    $database = [Uri]$Values['SUPABASE_DB_URL']
  } catch {
    return $false
  }

  return (
    $api.Scheme -eq 'http' -and
    $api.Host -eq '127.0.0.1' -and
    $api.Port -eq 54321 -and
    $database.Scheme -eq 'postgresql' -and
    $database.Host -eq '127.0.0.1' -and
    $database.Port -eq 54322
  )
}

function Read-LocalEnv {
  param([string]$Path)

  $values = @{}
  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') {
      $values[$Matches[1]] = $Matches[2]
    }
  }

  return $values
}

try {
  $scriptRoot = Split-Path -Parent $PSCommandPath
  $repoRoot = [IO.Path]::GetFullPath((Join-Path $scriptRoot '..'))
  $configPath = Join-Path $repoRoot 'supabase\config.toml'
  $cliPath = Join-Path $repoRoot 'node_modules\.bin\supabase.cmd'
  $cliHome = Join-Path $repoRoot '.supabase-cli-home'
  $envFile = Join-Path $repoRoot '.env.local'

  if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf) -or -not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    Stop-LocalRefused
  }

  $config = [IO.File]::ReadAllText($configPath)
  if ($config -notmatch '(?m)^project_id = "progress-invoice-series"$') {
    Stop-LocalRefused
  }

  [IO.Directory]::CreateDirectory($cliHome) | Out-Null
  $xdgConfigHome = Join-Path $cliHome '.config'
  [IO.Directory]::CreateDirectory($xdgConfigHome) | Out-Null

  $env:SUPABASE_HOME = $cliHome
  $env:HOME = $cliHome
  $env:USERPROFILE = $cliHome
  $env:XDG_CONFIG_HOME = $xdgConfigHome

  $environmentNamesToClear = @(
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_PROFILE',
    'SUPABASE_PROJECT_ID',
    'SUPABASE_PROJECT_REF',
    'SUPABASE_DB_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'DB_URL',
    'PGHOST',
    'PGPORT',
    'PGUSER',
    'PGPASSWORD',
    'PGDATABASE'
  )
  foreach ($configEnvMatch in [regex]::Matches($config, 'env\(([A-Z][A-Z0-9_]*)\)')) {
    $environmentNamesToClear += $configEnvMatch.Groups[1].Value
  }
  $environmentNamesToClear | Sort-Object -Unique | ForEach-Object {
    [Environment]::SetEnvironmentVariable($_, $null, 'Process')
  }

  if ($null -eq $CommandArgs) {
    $CommandArgs = @()
  }

  if (Test-ExactArgs -Actual $CommandArgs -Expected @('env', 'guard')) {
    if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
      Stop-LocalRefused
    }

    $localValues = Read-LocalEnv $envFile
    if (-not (Test-LocalEndpoints $localValues)) {
      Stop-LocalRefused
    }
    foreach ($requiredKey in @('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY')) {
      if (-not $localValues.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace($localValues[$requiredKey])) {
        Stop-LocalRefused
      }
    }

    Assert-LocalStack
    [Console]::Out.WriteLine('LOCAL_OK')
    exit 0
  }

  if (Test-ExactArgs -Actual $CommandArgs -Expected @('env', 'setup')) {
    if (Test-Path -LiteralPath $envFile) {
      Stop-LocalRefused
    }

    Assert-LocalStack
    $ErrorActionPreference = 'Continue'
    $statusOutput = @(& $cliPath status --output env --workdir $repoRoot 2>&1)
    $statusExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($statusExitCode -ne 0) {
      Stop-LocalRefused
    }

    $statusValues = ConvertFrom-StatusEnv $statusOutput
    foreach ($requiredKey in @('API_URL', 'DB_URL', 'PUBLISHABLE_KEY', 'ANON_KEY', 'SERVICE_ROLE_KEY')) {
      if (-not $statusValues.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace($statusValues[$requiredKey])) {
        Stop-LocalRefused
      }
    }

    $localValues = @{
      NEXT_PUBLIC_SUPABASE_URL = $statusValues['API_URL']
      SUPABASE_DB_URL = $statusValues['DB_URL']
    }
    if (-not (Test-LocalEndpoints $localValues)) {
      Stop-LocalRefused
    }

    $environmentLines = @(
      "NEXT_PUBLIC_SUPABASE_URL=$($statusValues['API_URL'])",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$($statusValues['PUBLISHABLE_KEY'])",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=$($statusValues['ANON_KEY'])",
      "SUPABASE_SERVICE_ROLE_KEY=$($statusValues['SERVICE_ROLE_KEY'])",
      "SUPABASE_DB_URL=$($statusValues['DB_URL'])"
    )
    $utf8WithoutBom = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllLines($envFile, $environmentLines, $utf8WithoutBom)
    [Console]::Out.WriteLine('LOCAL_OK')
    exit 0
  }

  if (Test-ExactArgs -Actual $CommandArgs -Expected @('start')) {
    $ErrorActionPreference = 'Continue'
    $null = @(& $cliPath start --workdir $repoRoot 2>&1)
    $startExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($startExitCode -ne 0) {
      Stop-LocalRefused
    }
    Assert-LocalStack
    [Console]::Out.WriteLine('LOCAL_OK')
    exit 0
  }

  if (Test-ExactArgs -Actual $CommandArgs -Expected @('status')) {
    Assert-LocalStack
    $ErrorActionPreference = 'Continue'
    $null = @(& $cliPath status --workdir $repoRoot 2>&1)
    $statusExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($statusExitCode -ne 0) {
      Stop-LocalRefused
    }
    [Console]::Out.WriteLine('LOCAL_OK')
    exit 0
  }

  if (Test-ExactArgs -Actual $CommandArgs -Expected @('db', 'reset', '--local')) {
    Assert-LocalStack
    $ErrorActionPreference = 'Continue'
    & $cliPath db reset --local --workdir $repoRoot
    $cliExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    exit $cliExitCode
  }

  if (Test-ExactArgs -Actual $CommandArgs -Expected @('db', 'reset', '--local', '--version', '20260719225144')) {
    Assert-LocalStack
    $ErrorActionPreference = 'Continue'
    & $cliPath db reset --local --version 20260719225144 --workdir $repoRoot
    $cliExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    exit $cliExitCode
  }

  if (Test-ExactArgs -Actual $CommandArgs -Expected @('migration', 'up', '--local')) {
    Assert-LocalStack
    $ErrorActionPreference = 'Continue'
    & $cliPath migration up --local --workdir $repoRoot
    $cliExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    exit $cliExitCode
  }

  if ($CommandArgs.Count -ge 3 -and
      $CommandArgs[0] -ieq 'test' -and
      $CommandArgs[1] -ieq 'db' -and
      $CommandArgs[2] -ieq '--local') {
    if ($CommandArgs.Count -gt 3) {
      $testRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'supabase\tests'))
      $testRootPrefix = $testRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
      foreach ($testPath in $CommandArgs[3..($CommandArgs.Count - 1)]) {
        if ($testPath.StartsWith('-') -or [IO.Path]::IsPathRooted($testPath)) {
          Stop-LocalRefused
        }
        $resolvedTestPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $testPath))
        if (-not $resolvedTestPath.StartsWith($testRootPrefix, [StringComparison]::OrdinalIgnoreCase) -or
            [IO.Path]::GetExtension($resolvedTestPath) -ine '.sql' -or
            -not (Test-Path -LiteralPath $resolvedTestPath -PathType Leaf)) {
          Stop-LocalRefused
        }
      }
    }
    Assert-LocalStack
    $ErrorActionPreference = 'Continue'
    & $cliPath @CommandArgs --workdir $repoRoot
    $cliExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    exit $cliExitCode
  }

  $allowedGenTypes = (
    (Test-ExactArgs -Actual $CommandArgs -Expected @('gen', 'types', '--local')) -or
    (Test-ExactArgs -Actual $CommandArgs -Expected @('gen', 'types', '--local', '--lang', 'typescript', '--schema', 'public'))
  )
  if ($allowedGenTypes) {
    Assert-LocalStack
    $ErrorActionPreference = 'Continue'
    & $cliPath @CommandArgs --workdir $repoRoot
    $cliExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    exit $cliExitCode
  }

  if ($CommandArgs.Count -eq 3 -and
      $CommandArgs[0] -ieq 'migration' -and
      $CommandArgs[1] -ieq 'new' -and
      $CommandArgs[2] -cmatch '^[a-z][a-z0-9_]*$') {
    $ErrorActionPreference = 'Continue'
    & $cliPath @CommandArgs --workdir $repoRoot
    $cliExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    exit $cliExitCode
  }

  Stop-LocalRefused
} catch {
  Stop-LocalRefused
}
