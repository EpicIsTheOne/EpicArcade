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
  $stPort = FreePort
  $p1 = Start-Process -FilePath $node -ArgumentList "`"$run\dev-server.mjs`"", "$devPort", "`"$game`"" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$tmp\fnf-run2-dev.log" -RedirectStandardError "$tmp\fnf-run2-dev.err"
  $p2 = Start-Process -FilePath $node -ArgumentList "`"$run\qa\static-only.mjs`"", "$stPort", "`"$game`"" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$tmp\fnf-run2-static.log" -RedirectStandardError "$tmp\fnf-run2-static.err"
  "DEV=$devPort STATIC=$stPort DEVPID=$($p1.Id) STPID=$($p2.Id)" | Set-Content -LiteralPath "$tmp\fnf-run2-info.txt"
  Start-Sleep 2
  Get-Content -LiteralPath "$tmp\fnf-run2-info.txt"
  "dev exited: $($p1.HasExited) / static exited: $($p2.HasExited)"
} catch {
  Write-Output ("ERR: " + $_.Exception.Message)
  Write-Output ("AT:  " + $_.InvocationInfo.PositionMessage)
}
