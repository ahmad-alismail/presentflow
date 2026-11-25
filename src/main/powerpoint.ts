// Follows the slide PowerPoint shows (slideshow or editing view) through its COM automation
// interface, from the built-in Windows PowerShell — no native modules.
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { PowerPointState } from '@shared/types'

/**
 * Polls PowerPoint and prints one JSON line whenever the state changes. COM references are released
 * every round so PowerPoint can still close normally; "busy" (e.g. a modal dialog) is not reported as
 * disconnected, it simply produces no news.
 */
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Release($o) { if ($null -ne $o) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($o) } catch {} } }
$last = ''
while ($true) {
  $state = [ordered]@{ connected = $false }
  $app = $null; $ssw = $null; $win = $null; $pres = $null; $slide = $null
  $attached = $false; $busy = $false; $delay = 1500
  try {
    $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
    $attached = $true; $delay = 300
    $state.connected = $true
    if ($app.SlideShowWindows.Count -gt 0) {
      $ssw = $app.SlideShowWindows.Item(1)
      $state.mode = 'show'
      $pres = $ssw.Presentation
      try { $slide = $ssw.View.Slide } catch { $slide = $null }
    } elseif ($app.Windows.Count -gt 0) {
      $win = $app.ActiveWindow
      $state.mode = 'edit'
      $pres = $win.Presentation
      try { $slide = $win.View.Slide } catch { try { $slide = $win.Selection.SlideRange.Item(1) } catch { $slide = $null } }
    }
    if ($null -ne $pres) { $state.file = $pres.FullName; $state.count = $pres.Slides.Count }
    if ($null -ne $slide) {
      $state.slide = $slide.SlideIndex
      try { if ($slide.Shapes.HasTitle) { $state.title = $slide.Shapes.Title.TextFrame.TextRange.Text } } catch {}
    }
  } catch {
    if ($attached) { $busy = $true }
  } finally {
    Release $slide; Release $pres; Release $win; Release $ssw; Release $app
  }
  if (-not $busy) {
    $json = $state | ConvertTo-Json -Compress
    if ($json -ne $last) { [Console]::Out.WriteLine($json); [Console]::Out.Flush(); $last = $json }
  }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  Start-Sleep -Milliseconds $delay
}
`

export class PowerPointWatcher {
  private proc: ChildProcess | null = null
  private running = false
  private restartTimer: NodeJS.Timeout | undefined
  private last: PowerPointState = { connected: false }

  constructor(private readonly onState: (s: PowerPointState) => void) {}

  get state(): PowerPointState {
    return this.last
  }

  start(): void {
    if (process.platform !== 'win32' || this.running) return
    this.running = true
    this.spawn()
  }

  stop(): void {
    this.running = false
    clearTimeout(this.restartTimer)
    this.proc?.kill()
    this.proc = null
    this.emit({ connected: false })
  }

  private spawn(): void {
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64')
    const proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    this.proc = proc
    createInterface({ input: proc.stdout! }).on('line', (line) => {
      try {
        this.emit(JSON.parse(line) as PowerPointState)
      } catch {
        /* ignore partial lines */
      }
    })
    proc.on('exit', () => {
      if (this.proc !== proc) return
      this.proc = null
      this.emit({ connected: false })
      if (this.running) this.restartTimer = setTimeout(() => this.spawn(), 2000)
    })
    proc.on('error', () => undefined) // e.g. PowerShell missing: stay disconnected
  }

  private emit(s: PowerPointState): void {
    if (JSON.stringify(s) === JSON.stringify(this.last)) return
    this.last = s
    this.onState(s)
  }
}
