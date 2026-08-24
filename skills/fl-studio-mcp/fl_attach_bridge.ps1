# fl_attach_bridge.ps1 — attach the fLMCP bridge script inside a running FL Studio.
# Run IMMEDIATELY after launching FL Studio, while FL still owns the foreground.
# Sequence: focus FL -> F10 (MIDI dialog opens at fixed position) -> toggle
# Enable off->on at (1438, 828) -> F10 closes dialog. Verified positions for
# FL 2025 25.2.2 on a 3440x1440 display.
param(
    [int]$ToggleX = 1438,
    [int]$ToggleY = 828,
    [int]$F10Vk = 0x79
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices;
public class Attach {
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

function Send-Key {
    param([byte]$Vk)
    [Attach]::keybd_event($Vk, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 50
    [Attach]::keybd_event($Vk, 0, 2, [UIntPtr]::Zero)
}

function Click-At {
    param([int]$X, [int]$Y)
    [Attach]::SetCursorPos($X, $Y) | Out-Null; Start-Sleep -Milliseconds 150
    [Attach]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60
    [Attach]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}

# 1. find + focus FL main window
$fl = Get-Process FL64 -ErrorAction Stop | Select-Object -First 1
$script:flHwnd = [IntPtr]::Zero
$cb = [Attach+EnumProc]{ param($h, $l)
    $p = 0; [Attach]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
    if ($p -eq $fl.Id -and [Attach]::IsWindowVisible($h)) {
        $sb = New-Object System.Text.StringBuilder 256
        [Attach]::GetWindowText($h, $sb, 256) | Out-Null
        if ($sb.ToString() -match 'FL Studio') { $script:flHwnd = $h; return $false }
    }
    return $true
}
[Attach]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($script:flHwnd -eq [IntPtr]::Zero) { throw "FL Studio main window not found" }
[Attach]::SetForegroundWindow($script:flHwnd) | Out-Null
Start-Sleep -Milliseconds 800

# 2. F10 -> MIDI settings dialog (fixed position 1386,246)
Send-Key $F10Vk
Start-Sleep -Milliseconds 1800

# 3. toggle Enable off -> on (re-instantiates the controller script)
Click-At $ToggleX $ToggleY
Start-Sleep -Milliseconds 1200
Click-At $ToggleX $ToggleY
Start-Sleep -Milliseconds 2500

# 4. close dialog
Send-Key $F10Vk
Start-Sleep -Milliseconds 800
Write-Host "attach sequence done - verify with smoke_test.py"
