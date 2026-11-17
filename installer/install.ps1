# Opengantt BIM: downloads the release installer, checks its size and SHA-512, and runs it.
#   irm https://raw.githubusercontent.com/gjordanp/opengantt-bim/main/installer/install.ps1 | iex
# Options (when the file is saved and run): -Version 0.3.0  -Silent  -Check
param([string]$Version = '', [switch]$Silent, [switch]$Check)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = 'gjordanp/opengantt-bim'
if ($Version -and $Version -notmatch '^\d+\.\d+\.\d+$') { throw "Not a version: $Version (use for example 0.3.0)" }
$base = if ($Version) { "https://github.com/$repo/releases/download/v$Version/" } else { "https://github.com/$repo/releases/latest/download/" }

Write-Host 'Looking up the release...'
$content = (Invoke-WebRequest -UseBasicParsing "${base}latest.yml").Content
# The file is served as binary: Windows PowerShell 5.1 returns bytes, newer versions return text.
$yml = if ($content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($content) } else { $content }
$file = ([regex]::Match($yml, '(?m)^path:\s*(\S+)')).Groups[1].Value
$sha = ([regex]::Match($yml, '(?m)^sha512:\s*(\S+)')).Groups[1].Value
$size = [int64]([regex]::Match($yml, '(?m)^\s+size:\s*(\d+)')).Groups[1].Value
if (-not $file -or -not $sha -or -not $size) { throw 'latest.yml is missing path, sha512 or size' }
if ($file -notmatch '^[\w.-]+\.exe$') { throw "Unexpected installer name: $file" }
Write-Host ("Opengantt BIM: {0} ({1:N1} MB)" -f $file, ($size / 1MB))
if ($Check) { return }

$dir = Join-Path $env:TEMP ('openganttbim-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $dir | Out-Null
try {
  $path = Join-Path $dir $file
  Write-Host 'Downloading...'
  Invoke-WebRequest -UseBasicParsing "$base$file" -OutFile $path
  if ((Get-Item $path).Length -ne $size) { throw 'Wrong size: the download is damaged' }
  $sha64 = [Convert]::ToBase64String([System.Security.Cryptography.SHA512]::Create().ComputeHash([IO.File]::ReadAllBytes($path)))
  if ($sha64 -ne $sha) { throw 'The SHA-512 of the download does not match the one in latest.yml' }
  Write-Host 'Size and SHA-512 match the release. Starting the installer...'
  $run = @{ FilePath = $path; Wait = $true; PassThru = $true }
  if ($Silent) { $run.ArgumentList = '/S' }
  $p = Start-Process @run
  if ($p.ExitCode -ne 0) { throw "The installer ended with code $($p.ExitCode)" }
  Write-Host 'Done.'
} finally {
  Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
}
