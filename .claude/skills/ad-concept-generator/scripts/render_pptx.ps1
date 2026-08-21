param([Parameter(Mandatory=$true)][string]$Pptx, [string]$OutDir)
$Pptx = (Resolve-Path $Pptx).Path
if (-not $OutDir) { $OutDir = Join-Path (Split-Path $Pptx) "qa_png" }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory $OutDir | Out-Null }
$app = New-Object -ComObject PowerPoint.Application
$pres = $app.Presentations.Open($Pptx, $true, $false, $false)
$pres.Export($OutDir, "PNG", 1600, 900)
$pres.SaveAs((Join-Path $OutDir "deck.pdf"), 32)
$pres.Close(); $app.Quit()
Write-Output "rendered $((Get-ChildItem $OutDir -Filter *.PNG).Count) slides to $OutDir"
