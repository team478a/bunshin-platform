$ErrorActionPreference = 'Stop'
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 16)
$taskLabel = "bunshin-feedback-auth-$runId"
$dockerLabel = "label=codex.task=$taskLabel"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
Push-Location -LiteralPath $repoRoot
try {
    & ./scripts/test/feedback-real-auth-environment.ps1 -RunId $runId
    $env:BUNSHIN_TEST_RUN_ID = $runId
    $env:APP_ENV = 'development'
    $env:DATABASE_URL = "postgresql://postgres:synthetic-local-test-only@127.0.0.1:18998/bunshin_disposable_$runId"
    $env:DIRECT_URL = $env:DATABASE_URL
    pnpm db:migrate:deploy | Select-Object -Last 6
    if ($LASTEXITCODE -ne 0) { throw 'Disposable migration failed' }
    pnpm db:generate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma generation failed' }
    node ./scripts/test/fortune-isolated/run.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Fortune isolated E2E failed' }
} finally {
    foreach ($container in @(docker ps -q --filter $dockerLabel)) {
        docker stop $container | Out-Null
    }
    foreach ($network in @(docker network ls -q --filter $dockerLabel)) {
        docker network rm $network | Out-Null
    }
    Pop-Location
}
