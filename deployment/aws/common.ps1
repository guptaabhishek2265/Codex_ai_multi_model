$ErrorActionPreference = 'Stop'
$deploymentRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $deploymentRoot
Set-Location -LiteralPath $repositoryRoot
$env:AWS_PAGER = ''

function Invoke-Aws {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $result = & aws @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($result -join "`n") }
    return ($result -join "`n")
}

function Get-StackOutputs {
    param([string]$StackName, [string]$Region)
    $document = (Invoke-Aws -Arguments @('cloudformation', 'describe-stacks', '--stack-name', $StackName, '--region', $Region, '--output', 'json')) | ConvertFrom-Json
    $values = @{}
    foreach ($item in $document.Stacks[0].Outputs) { $values[$item.OutputKey] = $item.OutputValue }
    return $values
}
