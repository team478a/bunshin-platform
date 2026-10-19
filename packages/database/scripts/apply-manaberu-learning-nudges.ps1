$ErrorActionPreference = 'Stop'

# Keep one credential-handling implementation and scope this entrypoint to the
# exact single learning-nudge migration.
$previousAllowedSet = $env:DIRECT_MIGRATION_ALLOWED_SET_ID
$exitCode = 1
try {
  $env:DIRECT_MIGRATION_ALLOWED_SET_ID = 'manaberu-learning-nudges'
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
