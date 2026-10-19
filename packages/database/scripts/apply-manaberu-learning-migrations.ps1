$ErrorActionPreference = 'Stop'

# Keep one credential-handling implementation and scope this entrypoint to the
# exact six-migration Dynamic Learning set.
$previousAllowedSet = $env:DIRECT_MIGRATION_ALLOWED_SET_ID
$exitCode = 1
try {
  $env:DIRECT_MIGRATION_ALLOWED_SET_ID = 'manaberu-dynamic-learning'
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
