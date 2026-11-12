param(
    [string]$Region = 'ap-southeast-2',
    [string]$ProjectName = 'agentverse',
    [string]$RuntimeSecretArn,
    [ValidateSet(0, 1, 2)][int]$DesiredCount = 0,
    [string]$ImageTag = 'bootstrap'
)
. "$PSScriptRoot/common.ps1"
if ($ProjectName -notmatch '^[a-z][a-z0-9-]{2,19}$' -or $ImageTag -notmatch '^[A-Za-z0-9_.-]+$') { throw 'Invalid project name or image tag' }
$parameterFile = Join-Path $PSScriptRoot 'private/parameters.local.json'
if (-not (Test-Path -LiteralPath $parameterFile)) { throw 'Run node deployment/aws/prepare-config.mjs first' }
$parameters = Get-Content -LiteralPath $parameterFile -Raw | ConvertFrom-Json
foreach ($item in $parameters) {
    if ($item.ParameterKey -eq 'ProjectName') { $item.ParameterValue = $ProjectName }
    if ($item.ParameterKey -eq 'DesiredCount') { $item.ParameterValue = [string]$DesiredCount }
    if ($item.ParameterKey -eq 'ImageTag') { $item.ParameterValue = $ImageTag }
    if ($item.ParameterKey -eq 'RuntimeSecretArn' -and $RuntimeSecretArn) { $item.ParameterValue = $RuntimeSecretArn }
}
if (-not ($parameters | Where-Object { $_.ParameterKey -eq 'RuntimeSecretArn' }).ParameterValue) { throw 'Supply -RuntimeSecretArn with the ARN from Secrets Manager' }
$json = ConvertTo-Json -InputObject @($parameters) -Depth 8
[System.IO.File]::WriteAllText($parameterFile, $json, [System.Text.UTF8Encoding]::new($false))
& node deployment/aws/generate-templates.mjs
if ($LASTEXITCODE -ne 0) { throw 'Template generation failed' }
$stack = "$ProjectName-app"
$exists = $false
try { $null = Get-StackOutputs -StackName $stack -Region $Region; $exists = $true }
catch { if ($_ -notmatch 'does not exist') { throw } }
$operation = if ($exists) { 'update-stack' } else { 'create-stack' }
$arguments = @('cloudformation', $operation, '--stack-name', $stack, '--region', $Region, '--template-body', 'file://deployment/aws/stack.json', '--parameters', 'file://deployment/aws/private/parameters.local.json', '--capabilities', 'CAPABILITY_NAMED_IAM')
try { $null = Invoke-Aws -Arguments $arguments }
catch { if ($_ -match 'No updates are to be performed') { Write-Host 'No infrastructure changes.'; exit 0 }; throw }
Write-Host 'Stack submitted. AWS resources incur charges even when DesiredCount is zero.'
$waiter = if ($exists) { 'stack-update-complete' } else { 'stack-create-complete' }
$null = Invoke-Aws -Arguments @('cloudformation', 'wait', $waiter, '--stack-name', $stack, '--region', $Region)
$outputs = Get-StackOutputs -StackName $stack -Region $Region
foreach ($name in $outputs.Keys) { Write-Host "${name}: $($outputs[$name])" }
