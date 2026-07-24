$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# recordId, url  (records with no usable URL are omitted)
$rows = @(
  @{id='rec1EqImpTZwgZERq';url='https://getbrick.com/'},
  @{id='rec1zRYZTWRRk4aVP';url='https://www.graduationalliance.com/'},
  @{id='rec2F3EyVghhPQGWF';url='https://kindwater.com/'},
  @{id='rec2cGFEG4pJSM6EC';url='https://weliveconscious.com/products/beyond-brew'},
  @{id='rec38Wbes8bdACoKY';url='https://www.linola.com/'},
  @{id='rec3HM6adBRGtt2Or';url='https://www.cruises.com/'},
  @{id='rec3KWWjsTMWczdYS';url='https://www.tryclaimwise.com/'},
  @{id='rec3djoOYECly0GgT';url='https://www.plantur39.com/'},
  @{id='rec6ahczUYHwXMAzn';url='https://www.mulberryscleaners.com/'},
  @{id='rec7DvpLAQA7spdix';url='https://getmorelegalclients.com/'},
  @{id='rec9JRUzo42VjQTkF';url='https://trustedcompanyreviews.com/'},
  @{id='recACI4Kw1ZThnOL4';url='https://current.com/'},
  @{id='recB5eN5WzMMez9dq';url='https://www.kudoboard.com/'},
  @{id='recCDXazPorJZGWX9';url='https://www.business.com/'},
  @{id='recCYzo5ZDcgVAsit';url='https://www.nurx.com/'},
  @{id='recCay0GwraO8sFkj';url='https://alantara.io/'},
  @{id='recF2bdqXz7lA22Ny';url='https://www.deltachildren.com/'},
  @{id='recF4vyHDaX8nVOyJ';url='https://www.dreamgames.com/'},
  @{id='recF77fvrlVwjkybY';url='https://www.threadbeast.com/'},
  @{id='recGhy2QwI6hR6Dor';url='https://pharmanutra-us.com/'},
  @{id='recHNgY0P9UPhPCC5';url='https://ardmor.com/'},
  @{id='recJSxVOUL9eTZZro';url='https://www.usekickback.com/'},
  @{id='recKZYBJXAmCcN3a3';url='https://pathsocial.com/'},
  @{id='recKsH8ZJPY1AIzDy';url='https://www.gradepotentialtutoring.com/'},
  @{id='recMWBO5Tkcp09ywK';url='https://helloinnerwell.com/'},
  @{id='recNTxCgOga8znQd4';url='https://onsentowel.com/'},
  @{id='recOZ6tIQeTRVAS95';url='https://simpleclosure.com/'},
  @{id='recRKTIF5Yqi0Zh0y';url='https://www.zak.com/'},
  @{id='recS9fLN2OUm1miN0';url='https://1md.org/product/movemd'},
  @{id='recSGz9a6IXdwcPsU';url='https://www.cruisesonly.com/'},
  @{id='recSMmN6FVjwucVMV';url='https://www.consumervoice.org/'},
  @{id='recSTIpaezrutOfoT';url='https://www.mistplay.com/'},
  @{id='recTNkG1NSdAOsyIW';url='https://www.ilmakiage.com/'},
  @{id='recTeoGuBkornmcWi';url='https://plixi.com/'},
  @{id='recUE7SNZNKWIRJtQ';url='https://www.deltachildren.com/'},
  @{id='recVEEXlcXrbG2I11';url='https://frontlands.com/'},
  @{id='recVhR0HgnHricQAr';url='https://www.karex.com/'},
  @{id='recWTcHWco5nCqSjl';url='https://1md.org/product/livermd'},
  @{id='recYykd7e6Pcog4Q0';url='https://www.bridgemarketplace.com/'},
  @{id='recZwkbAebVDWzkGI';url='https://weliveconscious.com/products/collagen-peptides'},
  @{id='recaB3C7TAgESFL2s';url='https://www.miraclebrand.co/'},
  @{id='recbdXntGjMYvxbZW';url='https://www.inmyarea.com/'},
  @{id='recbndRGOkguvKkoM';url='https://www.thronescience.com/'},
  @{id='recdEcqqOpq5p5jfP';url='https://www.quotemanage.com/'},
  @{id='recdzwvecosWTM86f';url='https://www.atticus.com/'},
  @{id='rece50MJVVI4FimzY';url='https://www.mysocialcalendar.com/'},
  @{id='receYMAdyv6zlbpQ4';url='https://onlyrx.com/'},
  @{id='recetyr1eQozYP7aQ';url='https://bellini.com/'},
  @{id='recfNuoO6cZ3K39jR';url='https://www.golfcartsofatx.com/'},
  @{id='recfeAktTYdOn7IwR';url='https://www.spoiledchild.com/'},
  @{id='recghLCPOhzZjJvJF';url='https://www.joinarbor.com/'},
  @{id='rechCc4FCNFRrrqdt';url='https://1md.org/product/vision-md'},
  @{id='rechtfFlGB0afHWk0';url='https://www.symplelending.com/'},
  @{id='reciAlZ3YI7gC31E5';url='https://pushpul.com/'},
  @{id='reckcd01Xd9Jo44nW';url='https://theflowery.co/'},
  @{id='recklFejcwupRBgI8';url='https://www.cheapcruises.com/'},
  @{id='reclPJuOK1fqRicG7';url='https://www.immy.co/'},
  @{id='recn5QJoyfEZUD8Bv';url='https://rentredi.com/'},
  @{id='recnRmKIU9vDavaVI';url='https://financeadvisors.com/'},
  @{id='recnehstCwyEtTI7Q';url='https://weliveconscious.com/products/beyond-collagen'},
  @{id='recnptkBMPNMCBVOT';url='https://www.harleymeds.com/'},
  @{id='reco4GIoTlI9uOQCh';url='https://www.trueclassictees.com/'},
  @{id='recoTnqenlvgV5H8b';url='https://www.autoinsurance.com/'},
  @{id='recoy46Uf1X7gTQP0';url='https://www.simplepathfinancial.com/'},
  @{id='recpt8N4kLUEEiuKm';url='https://www.alpecin.com/'},
  @{id='recq4JfBBtI58whW1';url='https://weliveconscious.com/'},
  @{id='recr3p3sMAyxjY6Zz';url='https://evolvlife.com/'},
  @{id='recr9ir7lSY9PuCyy';url='https://weliveconscious.com/products/hair-la-vie-clinical-formula'},
  @{id='recrOlU4EvIEuhvMt';url='https://www.dreamgames.com/'},
  @{id='recriBKpAppyYkPug';url='https://gir.co/'},
  @{id='rectLh4H8n4MhtApN';url='https://happyaging.com/'},
  @{id='recteLBypMZ0AnCRs';url='https://huckleberrycare.com/'},
  @{id='recuHx3Uo9TuZ8MF4';url='https://www.bioniq.com/'},
  @{id='recunpMOcV3v8xc3j';url='https://naturalforce.com/'},
  @{id='recxr85uBHBFkdrat';url='https://www.entreprenista.com/'},
  @{id='recyrT53V666dAg5I';url='https://www.mysocialcalendar.com/'},
  @{id='recysHB0QN0BObd0i';url='https://www.hometap.com/'},
  @{id='recztyyd6CMNDZZzO';url='https://resqjewelry.com/'}
)

$genericFonts = @('sans-serif','serif','monospace','system-ui','-apple-system','blinkmacsystemfont','segoe ui','helvetica neue','helvetica','arial','roboto','sans','cursive','fantasy','inherit','initial','unset','none','ui-sans-serif','ui-serif','ui-monospace','apple-system','tahoma','verdana','sans serif','-webkit-pictograph','math','body','quot','&quot','chinese quote','swiper-icons','webflow-icons','tss-font','material icons','fontawesome','icomoon')

function Clean-FontName($name) {
  if (-not $name) { return $null }
  $n = $name -replace '!important','' -replace '\\','' -replace '"','' -replace "'",''
  $n = $n.Trim()
  # Next.js / hashed local font names: __Inter_fa2f99 -> Inter, __Hanken_Grotesk_6c0d1d -> Hanken Grotesk
  $m = [regex]::Match($n, '^_+(.+?)_[0-9a-fA-F]{4,8}(_Fallback)?$')
  if ($m.Success) { $n = $m.Groups[1].Value -replace '_',' ' }
  $n = $n.Trim()
  return $n
}

function Is-JunkFont($n) {
  if (-not $n) { return $true }
  $l = $n.ToLower()
  if ($genericFonts -contains $l) { return $true }
  # icon fonts, fallbacks, vendor utility fonts
  if ($l -match 'icon' -or $l -match 'awesome' -or $l -match 'glyph' -or $l -match 'dashicons' -or $l -match 'judgeme' -or $l -match 'webflow' -or $l -match 'swiper' -or $l -match 'gform' -or $l -match 'bootstrap' -or $l -match 'fallback' -or $l -match 'pictograph' -or $l -match '^bq' -or $l -match 'logo$' -or $l -match '!important' -or $l -match '\$' -or $l -match '^var\(' -or $l -match 'local$') { return $true }
  if ($l.Length -lt 2 -or $l.Length -gt 40) { return $true }
  return $false
}

function Get-Text($url) {
  try { return (Invoke-WebRequest -Uri $url -Headers @{ 'User-Agent'=$ua } -UseBasicParsing -TimeoutSec 12).Content } catch { return '' }
}

function Scrape($url) {
  $html = Get-Text $url
  if (-not $html) { return $null }
  $origin = ([System.Uri]$url).Scheme + '://' + ([System.Uri]$url).Host
  $blob = $html
  $links = [regex]::Matches($html, '<link[^>]+rel=["'']?stylesheet["'']?[^>]*>') | ForEach-Object { $_.Value }
  $cssUrls = @()
  foreach ($tag in $links) {
    $m = [regex]::Match($tag, 'href=["'']([^"'']+)["'']')
    if (-not $m.Success) { continue }
    $href = $m.Groups[1].Value
    if ($href.StartsWith('//')) { $href = 'https:' + $href }
    elseif ($href.StartsWith('/')) { $href = $origin + $href }
    elseif ($href -notmatch '^https?:') { $href = $origin + '/' + $href }
    $cssUrls += $href
  }
  foreach ($u in ($cssUrls | Select-Object -First 6)) { $blob += "`n" + (Get-Text $u) }

  # ---- COLORS ----
  $counts = @{}
  foreach ($m in [regex]::Matches($blob, '#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')) {
    $h = $m.Groups[1].Value.ToLower()
    if ($h.Length -eq 3) { $h = ($h[0]+$h[0]+$h[1]+$h[1]+$h[2]+$h[2]) }
    $h = '#'+$h; if ($counts.ContainsKey($h)) { $counts[$h]++ } else { $counts[$h]=1 }
  }
  foreach ($m in [regex]::Matches($blob, 'rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})')) {
    $r=[int]$m.Groups[1].Value; $g=[int]$m.Groups[2].Value; $b=[int]$m.Groups[3].Value
    if ($r -gt 255 -or $g -gt 255 -or $b -gt 255) { continue }
    $h = '#{0:x2}{1:x2}{2:x2}' -f $r,$g,$b
    if ($counts.ContainsKey($h)) { $counts[$h]++ } else { $counts[$h]=1 }
  }
  $branded = $counts.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
    $hex=$_.Key; $r=[Convert]::ToInt32($hex.Substring(1,2),16); $g=[Convert]::ToInt32($hex.Substring(3,2),16); $b=[Convert]::ToInt32($hex.Substring(5,2),16)
    $max=[Math]::Max($r,[Math]::Max($g,$b)); $min=[Math]::Min($r,[Math]::Min($g,$b))
    $sat = if ($max -eq 0){0}else{($max-$min)/$max}
    if (-not (($sat -lt 0.12) -or ($max -lt 18) -or ($min -gt 238))) { $hex }
  }
  $branded = @($branded)
  $primary = if ($branded.Count -ge 1) { $branded[0] } else { $null }
  $secondary = if ($branded.Count -ge 2) { $branded[1] } else { $null }
  $accent = if ($branded.Count -ge 3) { $branded[2] } else { $null }

  # ---- FONTS ----
  $fontCounts = @{}
  function AddFont($name, $weight) {
    $n = Clean-FontName $name
    if (Is-JunkFont $n) { return }
    if ($fontCounts.ContainsKey($n)) { $fontCounts[$n] += $weight } else { $fontCounts[$n] = $weight }
  }
  # Google Fonts links (strongest signal)
  foreach ($m in [regex]::Matches($blob, 'fonts\.googleapis\.com/css2?\?([^"''<> ]+)')) {
    foreach ($fm in [regex]::Matches($m.Groups[1].Value, 'family=([^&:]+)')) {
      $fam = [Uri]::UnescapeDataString($fm.Groups[1].Value).Replace('+',' ')
      AddFont $fam 8
    }
  }
  # @font-face families (strong signal)
  foreach ($m in [regex]::Matches($blob, '@font-face\s*\{[^}]*?font-family\s*:\s*([^;}]+)')) {
    AddFont (($m.Groups[1].Value -split ',')[0]) 4
  }
  # general font-family usage (first named font in each declaration)
  foreach ($m in [regex]::Matches($blob, 'font-family\s*:\s*([^;}{]+)')) {
    AddFont (($m.Groups[1].Value -split ',')[0]) 1
  }
  $topFonts = $fontCounts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 2 | ForEach-Object { $_.Key }
  $fonts = ($topFonts -join ', ')

  return [pscustomobject]@{ primary=$primary; secondary=$secondary; accent=$accent; fonts=$fonts; branded_count=$branded.Count }
}

$results = @()
$i = 0
foreach ($row in $rows) {
  $i++
  Write-Host ("[{0}/{1}] {2}" -f $i, $rows.Count, $row.url)
  $r = $null
  try { $r = Scrape $row.url } catch { $r = $null }
  if ($null -eq $r) {
    $results += [pscustomobject]@{ id=$row.id; url=$row.url; primary=$null; secondary=$null; accent=$null; fonts=$null; ok=$false }
  } else {
    $results += [pscustomobject]@{ id=$row.id; url=$row.url; primary=$r.primary; secondary=$r.secondary; accent=$r.accent; fonts=$r.fonts; ok=$true }
    Write-Host ("       colors: {0} {1} {2} | fonts: {3}" -f $r.primary,$r.secondary,$r.accent,$r.fonts)
  }
}

$out = 'c:\Clients\Creative Adbundance\Creative-Adbundance\Docs\Static Ads Generator\_scrape_results.json'
$results | ConvertTo-Json -Depth 5 | Out-File -FilePath $out -Encoding utf8
Write-Host "DONE -> $out  ($($results.Count) records, $(($results | Where-Object {$_.ok}).Count) ok)"