# Daily Ship Log control script: start | stop | status | open
# Ownership rule: we ONLY ever stop processes whose command line positively
# identifies them as THIS project's server (unique run-dir path + server.py).
param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "status", "open")]
  [string]$Action = "status",
  # Run dir must be passed explicitly when this script runs from a copy
  # (the real project path contains [] which PowerShell cannot glob).
  [Parameter(Position = 1)]
  [string]$ProjectDir = ""
)

$ErrorActionPreference = "Stop"
if ($ProjectDir) {
  $RunDir = $ProjectDir
} else {
  $RunDir = Split-Path -Parent $PSScriptRoot   # tools/.. = run dir
}
$Marker = Join-Path $RunDir "app"            # unique identity fragment
$RuntimePath = Join-Path $RunDir "state\runtime.json"
$PythonExe = "python.exe"
$BaseUrl = $null

function Get-Runtime {
  if (Test-Path -LiteralPath $RuntimePath) {
    try { return Get-Content -LiteralPath $RuntimePath -Raw | ConvertFrom-Json } catch { return $null }
  }
  return $null
}

function Test-IsOurs($proc) {
  # Positive identification: command line must reference THIS run's app dir.
  # NOTE: plain IndexOf (NOT -like) - the run dir name contains [] wildcard chars.
  if ($null -eq $proc) { return $false }
  $cl = $proc.CommandLine
  if (-not $cl) { return $false }
  return ($cl.IndexOf($Marker, [StringComparison]::OrdinalIgnoreCase) -ge 0) -and
         ($cl.IndexOf("server.py", [StringComparison]::OrdinalIgnoreCase) -ge 0)
}

function Get-OwningProcesses {
  # Sweep strictly by command-line identity - never by image name alone.
  Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
    Where-Object { Test-IsOurs $_ }
}

function Test-ApiUp([string]$url) {
  try {
    $resp = Invoke-RestMethod -Uri "$url/api/meta" -TimeoutSec 3
    return ($resp.product -eq "daily-ship-log")
  } catch { return $false }
}

function Start-ShipLog {
  $rt = Get-Runtime
  if ($rt -and $rt.url -and (Test-ApiUp $rt.url)) {
    Write-Host "Already RUNNING at $($rt.url) (pid $($rt.pid)) - no duplicate started."
    Write-Host "URL: $($rt.url)"
    return
  }
  # stale runtime file -> clear it
  if (Test-Path -LiteralPath $RuntimePath) { Remove-Item -LiteralPath $RuntimePath -Force -ErrorAction SilentlyContinue }

  Write-Host "Starting Daily Ship Log backend..."
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $PythonExe
  $psi.Arguments = '-X utf8 "' + (Join-Path $Marker 'server.py') + '"'
  $psi.WorkingDirectory = $RunDir
  $psi.CreateNoWindow = $true
  $psi.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  # wait for API (server picks its own free port and writes runtime.json)
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 700
    $rt2 = Get-Runtime
    if ($rt2 -and $rt2.url -and (Test-ApiUp $rt2.url)) {
      Write-Host "RUNNING. URL: $($rt2.url)  (pid $($rt2.pid))"
      Write-Host "URL: $($rt2.url)"
      return
    }
    if ($p.HasExited) { break }
  }
  Write-Warning "Server did not become ready in time (launcher pid $($p.Id)). Check state\shiplog.log"
}

function Stop-ShipLog {
  $targets = @(Get-OwningProcesses)
  # also include the recorded pid if it still exists and verifies as ours
  $rt = Get-Runtime
  if ($rt -and $rt.pid) {
    $rec = Get-CimInstance Win32_Process -Filter "ProcessId=$($rt.pid)" -ErrorAction SilentlyContinue
    if ($rec -and (Test-IsOurs $rec) -and -not ($targets | Where-Object ProcessId -eq $rec.ProcessId)) {
      $targets += $rec
    }
  }
  if (-not $targets.Count) {
    Write-Host "Daily Ship Log is not running (no owned processes found). Nothing stopped."
    if (Test-Path -LiteralPath $RuntimePath) { Remove-Item -LiteralPath $RuntimePath -Force -ErrorAction SilentlyContinue }
    return
  }
  foreach ($t in $targets) {
    Write-Host ("Stopping owned process pid={0} ({1})" -f $t.ProcessId, ($t.CommandLine.Substring(0, [Math]::Min(90, $t.CommandLine.Length))))
    Stop-Process -Id $t.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 800
  $leftover = @(Get-OwningProcesses)
  if (Test-Path -LiteralPath $RuntimePath) { Remove-Item -LiteralPath $RuntimePath -Force -ErrorAction SilentlyContinue }
  if ($leftover.Count) {
    Write-Warning "$($leftover.Count) owned process(es) survived; re-check manually."
  } else {
    Write-Host "Stopped cleanly. Unrelated processes were never touched."
  }
}

function Show-Status {
  $rt = Get-Runtime
  $procs = @(Get-OwningProcesses)
  Write-Host "== Daily Ship Log STATUS =="
  Write-Host ("Backend process : {0}" -f $(if ($procs.Count) { "RUNNING (pid(s) $($procs.ProcessId -join ', '))" } else { "STOPPED" }))
  if ($rt -and $rt.url -and (Test-ApiUp $rt.url)) {
    $meta = Invoke-RestMethod -Uri "$rt.url/api/meta" -TimeoutSec 5
    $live = Invoke-RestMethod -Uri "$rt.url/api/live" -TimeoutSec 15
    Write-Host ("Journal service : RUNNING")
    Write-Host ("URL             : {0}" -f $rt.url)
    Write-Host ("Uptime          : {0:n0} min" -f ($meta.uptime_s / 60))
    Write-Host ("Observer source : {0} (verified={1})" -f $meta.observer.source, $meta.observer.verified)
    Write-Host ("Archived        : {0} prompts / {1} sessions / {2} commits" -f `
      $meta.counts.prompts, $meta.counts.sessions, $meta.counts.commits)
    Write-Host ("Last heavy pass : {0}" -f $meta.last_heavy_iso)
    Write-Host ("Next heavy pass : {0}" -f $meta.next_heavy_iso)
    Write-Host ("Live sessions   : {0}" -f $live.sessions.Count)
    Write-Host ("Runner procs    : {0}" -f $meta.runner_processes)
  } else {
    Write-Host "Journal service : STOPPED (no API response)"
  }
}

function Open-ShipLog {
  $rt = Get-Runtime
  if (-not ($rt -and $rt.url -and (Test-ApiUp $rt.url))) {
    Write-Host "Service is stopped - starting it first..."
    Start-ShipLog | Out-Null
    $rt = Get-Runtime
  }
  if ($rt -and $rt.url) {
    Write-Host "Opening $($rt.url) in default browser..."
    Start-Process $rt.url
    Write-Host "URL: $($rt.url)"
  } else {
    Write-Warning "Could not determine journal URL."
  }
}

switch ($Action) {
  "start"  { Start-ShipLog }
  "stop"   { Stop-ShipLog }
  "status" { Show-Status }
  "open"   { Open-ShipLog }
}
