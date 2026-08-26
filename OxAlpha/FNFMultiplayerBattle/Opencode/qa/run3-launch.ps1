$ErrorActionPreference = 'Stop'
$run = 'D:\Ox model test\FNF Multiplayer Battle [model-openrouter-stealth-ox-alpha] [opencode] [run-01]'
$game = Join-Path $run 'FNF Multiplayer Battle-opencode'
$tmp = Join-Path $env:TEMP 'opencode'
function FreePort {
  $l = [System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $l.Start(); $p = ($l.LocalEndpoint).Port; $l.Stop(); return $p
}
try {
  $node = "$env:SystemDrive\Program Files\nodejs\node.exe"
  $devPort = FreePort
  $p1 = Start-Process -FilePath $node -ArgumentList "`"$run\dev-server.mjs`"", "$devPort", "`"$game`"" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$tmp\fnf-run3-dev.log" -RedirectStandardError "$tmp\fnf-run3-dev.err"
  "DEVPID=$($p1.Id) PORT=$devPort" | Set-Content -LiteralPath "$tmp\fnf-run3-info.txt"
  Start-Sleep 2
  Get-Content -LiteralPath "$tmp\fnf-run3-info.txt"
} catch {
  Write-Output ("ERR: " + $_.Exception.Message)
}
