$ErrorActionPreference = 'Stop'

# Reuse the shared secure credential prompt and restrict it to the exact
# three-migration release set.
$previousAllowedSet = $env:DIRECT_MIGRATION_ALLOWED_SET_ID
$exitCode = 1
try {
  $env:DIRECT_MIGRATION_ALLOWED_SET_ID = 'release-20261020'
  $runner = Join-Path $PSScriptRoot 'apply-line-link-migrations.ps1'
  & $runner
  $exitCode = $LASTEXITCODE
}
finally {
  if ($null -eq $previousAllowedSet) {
    Remove-Item Env:DIRECT_MIGRATION_ALLOWED_SET_ID -ErrorAction SilentlyContinue
  }
  else {
    $env:DIRECT_MIGRATION_ALLOWED_SET_ID = $previousAllowedSet
  }
}

exit $exitCode
