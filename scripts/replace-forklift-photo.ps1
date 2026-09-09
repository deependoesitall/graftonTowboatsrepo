# scripts/replace-forklift-photo.ps1
#
# Replaces the Towboat Supplies photo.
#
# WHY: the current public/site/forklift.jpg is 269x188 and 13 KB — the softest
# image on the site by a wide margin. It's displayed around 450px wide on the
# Services page, so it's a 1.7x upscale of an already-poor source, sitting right
# next to a 2500px meat counter and a 2500px workboat. The contrast makes it
# look worse than it would alone.
#
# It is STOCK, not a GTS photograph (Deepen, Sept 7), so swapping it costs
# nothing — no authenticity lost, nobody has to go take a picture.
#
# THE REPLACEMENT: a forklift moving shrink-wrapped pallets of drinks into a
# truck, with the driver visible. Same subject as the original (which was a
# forklift with palletized water), done at 2000px instead of 269px.
#
# ⚠️ KNOWN COMPROMISE: the truck carries another company's livery — Portuguese
# text reading "TRANSPORTES, LDA" and a .pt web address. It's small in frame and
# the Unsplash licence permits commercial use, but it IS another firm's branding
# on GTS's services page. Judged worth it against a 13 KB blur; swap for a real
# GTS photo of a loaded pallet at the Grafton dock whenever one exists.
#
# Licence: Unsplash — free for commercial use, no attribution required.
#
# HOW TO RUN
#   cd "C:\Users\Deepa\Documents\graftonTowboatsrepo"
#   powershell -ExecutionPolicy Bypass -File .\scripts\replace-forklift-photo.ps1
#
# Then commit and push. No code change needed — content.ts already points at
# /site/forklift.jpg, so the new file is picked up automatically.

$ErrorActionPreference = 'Stop'

$root   = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'public\site'
$dest   = Join-Path $outDir 'forklift.jpg'
$backup = Join-Path $outDir 'forklift-OLD-269px.jpg'

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

# Keep the old one until you've seen the new one on the deployed site.
if ((Test-Path $dest) -and -not (Test-Path $backup)) {
    Copy-Item $dest $backup
    Write-Host "Backed up the old image to forklift-OLD-269px.jpg" -ForegroundColor DarkGray
}

# Option A — forklift loading pallets into a truck, driver visible.
$url = 'https://images.unsplash.com/photo-1779517225996-d5b751f80f48?w=2000&q=80&fm=jpg'

# Option B (same shoot, wider, driver turned away) — swap the line above for:
# $url = 'https://images.unsplash.com/photo-1779517226273-bcf843b759b9?w=2000&q=80&fm=jpg'

Write-Host ''
Write-Host 'Downloading replacement Towboat Supplies photo...' -ForegroundColor Cyan

try {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    $kb = [math]::Round((Get-Item $dest).Length / 1KB, 1)
    Write-Host ("  OK   forklift.jpg   {0} KB  (was 13 KB)" -f $kb) -ForegroundColor Green
    Write-Host ''
    Write-Host 'Commit and push — content.ts already points here, no code change needed.' -ForegroundColor Cyan
}
catch {
    Write-Host ("  FAIL  {0}" -f $_.Exception.Message) -ForegroundColor Red
    Write-Host '  The old image is untouched. Download by hand from unsplash.com if needed.' -ForegroundColor Yellow
}
Write-Host ''
