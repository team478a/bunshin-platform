param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{12,32}$')][string]$RunId)
$ErrorActionPreference = 'Stop'
# Test-only local runtime. Use a fresh RunId; stop/remove the recorded IDs after testing.
$taskLabel = "bunshin-feedback-auth-$RunId"
$privateNetwork = "bunshin-feedback-auth-$RunId"
$edgeNetwork = "bunshin-feedback-edge-$RunId"
$databaseContainer = "bunshin-feedback-db-$RunId"
$authContainer = "bunshin-feedback-auth-$RunId"
$gatewayContainer = "bunshin-feedback-gateway-$RunId"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
foreach ($name in @($databaseContainer,$authContainer,$gatewayContainer)) {
    $existingNames = @(docker ps -a --format '{{.Names}}')
    if ($LASTEXITCODE -ne 0) { throw 'Docker inventory unavailable' }
    if ($existingNames -contains $name) { throw "Refusing an existing container: $name" }
}
foreach ($name in @($privateNetwork,$edgeNetwork)) {
    $existingNames = @(docker network ls --format '{{.Name}}')
    if ($LASTEXITCODE -ne 0) { throw 'Docker network inventory unavailable' }
    if ($existingNames -contains $name) { throw "Refusing an existing network: $name" }
}
function Invoke-TestDocker {
    # Plain function: Docker's -e must not bind to PowerShell common parameters.
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw 'Test-only Docker operation failed; inspect/clean only the printed task resources.' }
}
Invoke-TestDocker network create --internal --label "codex.task=$taskLabel" $privateNetwork
Invoke-TestDocker network create --label "codex.task=$taskLabel" $edgeNetwork
Invoke-TestDocker run -d --rm --pull never --name $databaseContainer --label "codex.task=$taskLabel" --network $privateNetwork --network-alias db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=synthetic-local-test-only -e "POSTGRES_DB=bunshin_disposable_$RunId" postgres:16
Invoke-TestDocker run -d --rm --pull never --name $gatewayContainer --label "codex.task=$taskLabel" --network $edgeNetwork -p 127.0.0.1:18998:18998 -p 127.0.0.1:18999:18999 --read-only --cap-drop ALL --security-opt no-new-privileges --mount "type=bind,source=$repoRoot\scripts\test\feedback-e2e-gateway.mjs,target=/e2e-gateway.mjs,readonly" --entrypoint node node:24-alpine /e2e-gateway.mjs
Invoke-TestDocker network connect $privateNetwork $gatewayContainer
$ready = $false
for ($attempt=0; $attempt -lt 30; $attempt++) {
    docker exec $databaseContainer pg_isready -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready=$true; break }
    Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw 'Disposable PostgreSQL readiness deadline' }
Invoke-TestDocker exec $databaseContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE auth_e2e;'
Invoke-TestDocker exec $databaseContainer psql -U postgres -d auth_e2e -v ON_ERROR_STOP=1 -c 'CREATE SCHEMA auth;'
Invoke-TestDocker exec $databaseContainer psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'ALTER DATABASE auth_e2e SET search_path TO public,auth;'
Invoke-TestDocker exec $databaseContainer psql -U postgres -d "bunshin_disposable_$RunId" -v ON_ERROR_STOP=1 -c "COMMENT ON DATABASE bunshin_disposable_$RunId IS 'bunshin-disposable-test:$RunId';"
Invoke-TestDocker run -d --rm --pull never --name $authContainer --label "codex.task=$taskLabel" --network $privateNetwork --network-alias auth --cap-drop ALL --security-opt no-new-privileges -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:18999/auth/v1 -e GOTRUE_SITE_URL=http://127.0.0.1:19000 -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL=postgresql://postgres:synthetic-local-test-only@db:5432/auth_e2e -e GOTRUE_DB_NAMESPACE=auth -e GOTRUE_JWT_SECRET=synthetic-feedback-e2e-jwt-secret-not-production-8c09a184d3f6 -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role -e GOTRUE_DISABLE_SIGNUP=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_LOG_LEVEL=error public.ecr.aws/supabase/gotrue:v2.192.0
Write-Output 'Local environment created. Record all IDs and labels before migration/testing. No app migration or test executed by this setup helper.'
