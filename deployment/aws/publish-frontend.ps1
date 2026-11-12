param([string]$Region = 'ap-southeast-2', [string]$ProjectName = 'agentverse')
. "$PSScriptRoot/common.ps1"
$outputs = Get-StackOutputs -StackName "$ProjectName-app" -Region $Region
$settings = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'private/frontend-public.local.json') -Raw | ConvertFrom-Json
$settings.PSObject.Properties | ForEach-Object { [Environment]::SetEnvironmentVariable($_.Name, [string]$_.Value, 'Process') }
$env:VITE_SERVER_URL = $outputs.FrontendUrl
Push-Location frontend
try {
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
} finally { Pop-Location }
$null = Invoke-Aws -Arguments @('s3', 'sync', 'frontend/dist', "s3://$($outputs.FrontendBucketName)", '--delete', '--region', $Region)
$null = Invoke-Aws -Arguments @('cloudfront', 'create-invalidation', '--distribution-id', $outputs.DistributionId, '--paths', '/*')
Write-Host "Frontend published: $($outputs.FrontendUrl)"
