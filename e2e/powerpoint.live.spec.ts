// LIVE PowerPoint test (opt-in: PF_PPT_LIVE=1). Creates a temporary 3-slide deck with speaker notes via COM,
// imports it with the real .pptx parser, and checks that PresentFlow follows slide changes in the editing view.
// The deck is closed without saving; PowerPoint is quit only if it was not running before.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { pptxToScript } from '../src/main/pptx'
import { launch } from './app'

const shots = process.env.PF_SHOTS ?? path.resolve('test-results/screens')

function ps(script: string): string {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
    timeout: 120_000
  }).trim()
}

const SLIDES = [
  ['Einstieg', 'Guten Morgen und herzlich willkommen zu unserem Projektbericht. Heute zeige ich Ihnen drei Ergebnisse.'],
  ['Ergebnisse', 'Die Testumgebung lief zwölf Wochen ohne Unterbrechung. Alle Agenten erledigten ihre Büroaufgaben zuverlässig.'],
  ['Ausblick', 'Im nächsten Quartal erweitern wir die Studie auf weitere Sprachen. Vielen Dank für Ihre Aufmerksamkeit.']
]

test('follows real PowerPoint slide changes', async () => {
  test.skip(!process.env.PF_PPT_LIVE, 'set PF_PPT_LIVE=1 to run against a real PowerPoint')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-ppt-'))
  const deck = path.join(dir, 'PresentFlow-Live-Test.pptx')
  const wasRunning = ps(`[bool](Get-Process POWERPNT -ErrorAction SilentlyContinue)`) === 'True'
  const slidesPs = SLIDES.map(([t, n]) => `@('${t}','${n}')`).join(',')
  ps(`
    $app = New-Object -ComObject PowerPoint.Application
    $app.Visible = -1
    $pres = $app.Presentations.Add(-1)
    $i = 0
    foreach ($s in @(${slidesPs})) {
      $i++
      $slide = $pres.Slides.Add($i, 2)
      $slide.Shapes.Title.TextFrame.TextRange.Text = $s[0]
      $slide.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = $s[1]
    }
    $pres.SaveAs('${deck}')
    $pres.Windows.Item(1).View.GotoSlide(1)
  `)
  const goto = (n: number) =>
    ps(`
      $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
      $pres = $app.Presentations | Where-Object { $_.FullName -eq '${deck}' }
      $w = $pres.Windows.Item(1); $w.Activate(); $w.View.GotoSlide(${n})
    `)

  try {
    // The real parser on a file PowerPoint itself wrote.
    const imported = pptxToScript(fs.readFileSync(deck), 'Live-Test')
    expect(imported.source).toContain('# Folie 2 — Ergebnisse')
    expect(imported.source).toContain('Die Testumgebung lief zwölf Wochen')

    const { app, page } = await launch()
    await page.evaluate(async (src) => {
      const now = Date.now()
      await window.presentflow.presentations.save({ id: 'pptlive', title: 'Live-Test', language: 'de', source: src, cues: {}, createdAt: now, updatedAt: now })
    }, imported.source)
    await page.reload()
    await page.getByTestId('rehearse').click()
    const where = page.getByTestId('where')

    await expect(page.getByTestId('ppt-chip')).toContainText('1', { timeout: 15_000 })
    await expect(where).toContainText('Folie 1 — Einstieg')
    goto(2)
    await expect(where).toContainText('Folie 2 — Ergebnisse', { timeout: 5_000 })
    await expect(page.getByTestId('current')).toContainText('Die Testumgebung lief zwölf Wochen')
    await page.screenshot({ path: path.join(shots, 'ppt-live-slide2.png') })
    goto(3)
    await expect(where).toContainText('Folie 3 — Ausblick', { timeout: 5_000 })
    goto(1)
    await expect(where).toContainText('Folie 1 — Einstieg', { timeout: 5_000 })
    await app.close()
  } finally {
    ps(`
      $app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
      $pres = $app.Presentations | Where-Object { $_.FullName -eq '${deck}' }
      if ($pres) { $pres.Saved = -1; $pres.Close() }
      if (-not $${wasRunning ? 'true' : 'false'} -and $app.Presentations.Count -eq 0) { $app.Quit() }
    `)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
