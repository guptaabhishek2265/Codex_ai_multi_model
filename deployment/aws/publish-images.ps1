param([string]$Region = 'ap-southeast-2', [string]$ProjectName = 'agentverse', [string]$ImageTag = 'bootstrap')
. "$PSScriptRoot/common.ps1"
if ($ProjectName -notmatch '^[a-z][a-z0-9-]{2,19}$' -or $ImageTag -notmatch '^[A-Za-z0-9_.-]+$') { throw 'Invalid project name or image tag' }
$identity = (Invoke-Aws -Arguments @('sts', 'get-caller-identity', '--output', 'json')) | ConvertFrom-Json
$registry = "$($identity.Account).dkr.ecr.$Region.amazonaws.com"
$password = Invoke-Aws -Arguments @('ecr', 'get-login-password', '--region', $Region)
$password | & docker login --username AWS --password-stdin $registry
if ($LASTEXITCODE -ne 0) { throw 'Docker login failed' }
foreach ($service in @('auth', 'chat', 'agent', 'billing', 'gateway')) {
    try {
        $null = Invoke-Aws -Arguments @('ecr', 'describe-images', '--repository-name', "$ProjectName-$service", '--image-ids', "imageTag=$ImageTag", '--region', $Region)
        Write-Host "Image already published: $service"
        continue
    } catch { if ($_ -notmatch 'ImageNotFoundException') { throw } }
    $dockerfile = if ($service -eq 'gateway') { 'backend/gateway/Dockerfile' } else { "backend/services/$service/Dockerfile" }
    $image = "$registry/$ProjectName-${service}:$ImageTag"
    & docker build --platform linux/amd64 -f $dockerfile -t $image backend
    if ($LASTEXITCODE -ne 0) { throw "Build failed: $service" }
    & docker push $image
    if ($LASTEXITCODE -ne 0) { throw "Push failed: $service. Use a new ImageTag if this immutable tag already exists." }
}
Write-Host 'Five images published. This script does not start ECS tasks.'
