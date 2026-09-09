<##
.SYNOPSIS
  Fast, text-first Android smoke control for the Suya APK.

.DESCRIPTION
  Uses one ADB connection and the Android accessibility tree for navigation.
  Screenshots are optional checkpoints; normal taps, typing, back navigation,
  and crash checks do not capture the screen.
##>
[CmdletBinding()]
param(
  [ValidateSet('start', 'ui', 'tap-text', 'tap-desc', 'type', 'back', 'swipe', 'logs')]
  [string]$Action = 'start',
  [string]$Value,
  [int]$DurationMs = 250
)

$ErrorActionPreference = 'Stop'
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path -LiteralPath $adb)) { throw "ADB no encontrado: $adb" }

function Invoke-Adb([string[]]$Arguments) {
  & $adb @Arguments
  if ($LASTEXITCODE -ne 0) { throw "ADB falló ($LASTEXITCODE): $($Arguments -join ' ')" }
}

function Get-UiXml {
  $remote = '/sdcard/suya-window.xml'
  Invoke-Adb @('shell', 'uiautomator', 'dump', $remote) | Out-Null
  $xml = (& $adb shell cat $remote) -join "`n"
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($xml)) { throw 'No se pudo leer el árbol UI' }
  return [xml]$xml
}

function Find-Node([xml]$Xml, [string]$Attribute, [string]$Needle) {
  $nodes = $Xml.SelectNodes("//node[@$Attribute]")
  foreach ($node in $nodes) {
    if ($node.GetAttribute($Attribute) -eq $Needle) { return $node }
  }
  return $null
}

function Tap-Node([object]$Node) {
  if ($null -eq $Node) { throw 'Elemento no encontrado en el árbol UI' }
  if ($Node.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$') { throw 'Elemento sin bounds utilizables' }
  $x = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
  $y = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
  Invoke-Adb @('shell', 'input', 'tap', "$x", "$y")
}

switch ($Action) {
  'start' {
    Invoke-Adb @('shell', 'am', 'force-stop', 'com.suya.app')
    Invoke-Adb @('shell', 'monkey', '-p', 'com.suya.app', '1')
    Write-Output 'Suya iniciada; use -Action ui para leer la pantalla sin captura.'
  }
  'ui' {
    $ui = Get-UiXml
    $ui.SelectNodes('//node[@text or @content-desc]') |
      Where-Object { $_.text -or $_.'content-desc' } |
      ForEach-Object { "text=$($_.text) desc=$($_.'content-desc') bounds=$($_.bounds) enabled=$($_.enabled)" }
  }
  'tap-text' {
    if ([string]::IsNullOrWhiteSpace($Value)) { throw 'Indique -Value con el texto exacto' }
    Tap-Node (Find-Node (Get-UiXml) 'text' $Value)
  }
  'tap-desc' {
    if ([string]::IsNullOrWhiteSpace($Value)) { throw 'Indique -Value con el content-desc exacto' }
    Tap-Node (Find-Node (Get-UiXml) 'content-desc' $Value)
  }
  'type' {
    if ([string]::IsNullOrWhiteSpace($Value)) { throw 'Indique -Value con el texto' }
    $escaped = $Value -replace ' ', '%s' -replace '([&;|<>])', '\\$1'
    Invoke-Adb @('shell', 'input', 'text', $escaped)
  }
  'back' { Invoke-Adb @('shell', 'input', 'keyevent', 'KEYCODE_BACK') }
  'swipe' {
    $parts = $Value -split ',' | ForEach-Object { [int]$_.Trim() }
    if ($parts.Count -ne 4) { throw 'Use -Value x1,y1,x2,y2' }
    Invoke-Adb @('shell', 'input', 'swipe', "$($parts[0])", "$($parts[1])", "$($parts[2])", "$($parts[3])", "$DurationMs")
  }
  'logs' {
    $appPid = (& $adb shell pidof com.suya.app).Trim()
    if (-not $appPid) { throw 'Suya no está ejecutándose' }
    $fatal = & $adb logcat --pid=$appPid -d -t 600 | Select-String -Pattern 'FATAL EXCEPTION|AndroidRuntime|Uncaught|SIGSEGV|SIGABRT|Fatal signal' -CaseSensitive:$false
    if ($fatal) { $fatal; exit 1 }
    Write-Output 'Sin errores fatales en Suya.'
  }
}
