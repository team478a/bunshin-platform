$ErrorActionPreference = 'Stop'

# Keep one credential-handling implementation. The shared runner accepts this
# migration set only when all six pending names match its exact allowlist.
$runner = Join-Path $PSScriptRoot 'apply-line-link-migrations.ps1'
& $runner
exit $LASTEXITCODE
