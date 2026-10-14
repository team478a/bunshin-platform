$ErrorActionPreference = 'Stop'

$projectRef = 'vtkzinaudznwbsjoyszk'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$runner = Join-Path $PSScriptRoot 'apply-line-link-migrations.mjs'
$nodeCommand = Get-Command node -ErrorAction Stop
$nodeVersion = (& $nodeCommand.Source --version).Trim()
if ($nodeVersion -notmatch '^v24\.') {
  throw "Node.js 24 is required; found $nodeVersion. Install/use Node.js 24 and retry."
}

$securePassword = Read-Host "Supabase DB password for project $projectRef (input is hidden)" -AsSecureString
$passwordPointer = [IntPtr]::Zero
$previousDatabaseUrl = $env:DATABASE_URL
$previousDirectUrl = $env:DIRECT_URL
$exitCode = 1
try {
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $escapedPassword = [Uri]::EscapeDataString($password)
  $connection = "postgresql://postgres:${escapedPassword}@db.$projectRef.supabase.co:5432/postgres?sslmode=require&connect_timeout=10"

  Push-Location $repoRoot
  try {
    $env:DATABASE_URL = $connection
    $env:DIRECT_URL = $connection
    & $nodeCommand.Source $runner
    $exitCode = $LASTEXITCODE
  }
  finally {
    if ($null -eq $previousDatabaseUrl) {
      Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    }
    else {
      $env:DATABASE_URL = $previousDatabaseUrl
    }
    if ($null -eq $previousDirectUrl) {
      Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
    }
    else {
      $env:DIRECT_URL = $previousDirectUrl
    }
    Pop-Location
  }
}
finally {
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  $password = $null
  $escapedPassword = $null
  $connection = $null
  $previousDatabaseUrl = $null
  $previousDirectUrl = $null
  $securePassword.Dispose()
}

exit $exitCode
