# scripts/download-site-images.ps1
#
# Pulls the five marketing photos off Squarespace's CDN into public/site/.
#
# WHY THIS EXISTS: the site currently loads its photographs from
# images.squarespace-cdn.com. That works today, but those URLs belong to the
# Squarespace subscription — when it lapses on May 6, 2027, they will very
# likely stop resolving and every image on the marketing site disappears at
# once, silently. Nobody notices until a customer mentions it.
#
# Run this ONCE, any time before then. Sooner is better: it also removes the
# dependency on a service you're leaving, and local files load faster because
# they're served from the same CDN as the rest of the site.
#
# HOW TO RUN
#   1. Open PowerShell (Start menu -> type "PowerShell" -> Enter)
#   2. Paste this and press Enter:
#
#        cd "C:\Users\Deepa\Documents\graftonTowboatsrepo"
#        powershell -ExecutionPolicy Bypass -File .\scripts\download-site-images.ps1
#
#   3. Tell Claude it's done, and the code gets switched to the local copies.
#
# Safe to re-run — it just overwrites with fresh copies.

$ErrorActionPreference = 'Stop'

$root   = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'public\site'
$cdn    = 'https://images.squarespace-cdn.com/content/v1/6819038bc556772f05a46e4d'

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    Write-Host "Created $outDir"
}

# ?format=2500w asks the CDN for the largest version it holds. Three of these
# are 2500px originals; the other two are small at source and can't improve —
# they're flagged in content.ts as needing a reshoot from Jen.
$images = @(
    @{ name = 'river-sunset.jpg'; url = "$cdn/1746541643186-OQ80AQ5W3G4ZGHJTDO9B/unsplash-image-K0l4GwGX-Ec.jpg?format=2500w" }
    @{ name = 'meat-counter.jpg'; url = "$cdn/1746472744398-E7VAP4L3025LGQT3MXVP/unsplash-image-qgfjZUXup1M.jpg?format=2500w" }
    @{ name = 'workboat.jpg';     url = "$cdn/1746472336187-NSHGVFKNVH9YCOXH67QY/unsplash-image-jlrnKLjLcx0.jpg?format=2500w" }
    @{ name = 'forklift.jpg';     url = "$cdn/587ce179-d5ff-465a-9c69-578fbc6bd8db/download+%281%29.jpg?format=2500w" }
    @{ name = 'sisters.png';      url = "$cdn/2e583c7d-c344-4fb0-a74e-eb91759643e6/Untitled+%281%29.png?format=2500w" }
)

Write-Host ''
Write-Host 'Downloading marketing photos...' -ForegroundColor Cyan
Write-Host ''

$failed = @()
foreach ($img in $images) {
    $dest = Join-Path $outDir $img.name
    try {
        Invoke-WebRequest -Uri $img.url -OutFile $dest -UseBasicParsing
        $kb = [math]::Round((Get-Item $dest).Length / 1KB, 1)
        Write-Host ("  OK   {0,-20} {1} KB" -f $img.name, $kb) -ForegroundColor Green
    }
    catch {
        Write-Host ("  FAIL {0,-20} {1}" -f $img.name, $_.Exception.Message) -ForegroundColor Red
        $failed += $img.name
    }
}

Write-Host ''
if ($failed.Count -eq 0) {
    Write-Host "All 5 saved to public\site\" -ForegroundColor Green
    Write-Host "Next: tell Claude they're downloaded and the code gets pointed at them." -ForegroundColor Cyan
} else {
    Write-Host ("{0} failed: {1}" -f $failed.Count, ($failed -join ', ')) -ForegroundColor Yellow
    Write-Host "Download those by hand (right-click the image on the live site -> Save image as)." -ForegroundColor Yellow
}
Write-Host ''
