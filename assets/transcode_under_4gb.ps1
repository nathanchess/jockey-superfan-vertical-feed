# Transcode .mov -> H.264 MP4 proxies capped under 4 GB (TwelveLabs upload limit).
# Usage (from this folder):  .\transcode_under_4gb.ps1

$MaxOutputBytes = [int64](3.9 * 1GB)  # hard cap under 4 GB
$ScaleFilter    = "scale=-2:720"

$here = $PSScriptRoot
$outDir = Join-Path $here "proxies"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$log = Join-Path $outDir "_transcode.log"
"Started $(Get-Date -Format o)" | Out-File $log -Encoding utf8

Get-ChildItem -Path $here -Filter "*.mov" | ForEach-Object {
    $out = Join-Path $outDir ($_.BaseName + "_proxy.mp4")
    $line = "=== $($_.Name) -> $out $(Get-Date -Format o) ==="
    Write-Host $line
    $line | Out-File $log -Append -Encoding utf8

    # ffmpeg writes progress to stderr; do not let PowerShell treat that as a terminating error
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & ffmpeg -y -hide_banner -i $_.FullName `
        -map 0:v:0 `
        -map 0:a:0 `
        -vf $ScaleFilter `
        -c:v libx264 -crf 28 -preset veryfast `
        -c:a aac -b:a 128k `
        -movflags +faststart `
        -fs $MaxOutputBytes `
        $out 2>&1 | ForEach-Object { $_ | Out-File $log -Append -Encoding utf8; $_ }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prevEap

    if ($code -ne 0) {
        throw "ffmpeg failed on $($_.Name) exit $code"
    }
    if (-not (Test-Path $out)) {
        throw "No output file: $out"
    }
    $size = (Get-Item $out).Length
    if ($size -ge 4GB) {
        throw "Output >= 4GB: $out ($size bytes)"
    }
    $ok = "OK $([math]::Round($size/1MB, 1)) MB"
    Write-Host $ok
    $ok | Out-File $log -Append -Encoding utf8
}

Write-Host "All proxies under 4 GB in $outDir"
