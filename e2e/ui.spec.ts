// UI flow with injected transcripts (no microphone): library → sample → editor → rehearsal → summary.
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { hear, launch } from './app'

const asr: Record<string, { asr: string }> = JSON.parse(fs.readFileSync('test/fixtures/asr-transcripts.json', 'utf8'))
const shots = process.env.PF_SHOTS ?? path.resolve('test-results/screens')
fs.mkdirSync(shots, { recursive: true })

test('rehearsal follows speech, jumps, rescues and summarizes', async () => {
  const { app, page } = await launch()
  const shot = (name: string) => page.screenshot({ path: path.join(shots, `${name}.png`) })
  await page.setViewportSize({ width: 1040, height: 620 })
  // A PowerPoint open on this machine must not steer the rehearsal under test.
  await page.evaluate(() => window.presentflow.settings.set({ followPowerPoint: false }))

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await shot('01-library-empty')

  await page.getByTestId('open-sample').click()
  await expect(page.getByTestId('script-input')).toBeVisible()
  await shot('02-editor')

  await page.getByTestId('editor-rehearse').click()
  await expect(page.getByTestId('current')).toContainText('Guten Morgen')
  await expect(page.getByTestId('next')).toContainText('Ich möchte Ihnen heute zeigen')
  // Sidebar: every talking point of the section on top; slides below, the active one with its sections.
  const points = page.getByTestId('point')
  await expect(points).toHaveCount(3)
  await expect(points.nth(0)).toHaveAttribute('data-state', 'current')
  await expect(page.getByTestId('section-row')).toHaveText([/Begrüßung/, /Ausgangslage/])
  await expect(page.getByTestId('slide-row')).toHaveCount(4)
  await expect(page.locator('[data-testid="slide-row"][data-state="active"]')).toContainText('Einstieg')
  await shot('03-rehearsal-idle')

  await hear(page, 'u1', asr['s1-1'].asr)
  await expect(page.getByTestId('current')).toContainText('Ich möchte Ihnen heute zeigen')
  // Lyrics view: the sentence just left stays readable above the current one.
  await expect(page.getByTestId('prev')).toContainText('Guten Morgen')
  await expect(points.nth(0)).toHaveAttribute('data-state', 'said') // ticked, stays in place
  await expect(points.nth(1)).toHaveAttribute('data-state', 'current')
  await hear(page, 'u2', asr['s1-2'].asr)
  await expect(page.getByTestId('current')).toContainText('Am Ende werden Sie drei')
  await expect(page.getByTestId('prev')).toContainText('Ich möchte Ihnen heute zeigen')
  await expect(page.getByTestId('prev-older')).toContainText('Guten Morgen')
  await expect(page.getByTestId('next')).toContainText('Ausgangslage') // continuation label
  await shot('04-rehearsal-progress')

  // Jump to "Warum ist das wichtig?"
  await hear(page, 'u3', asr['s6-1'].asr)
  await expect(page.getByTestId('where')).toContainText('Warum ist das wichtig?')
  await expect(page.getByTestId('current')).toContainText('Kleine Fehlanreize')
  await expect(page.locator('[data-testid="section-row"][data-state="active"]')).toContainText('Warum ist das wichtig?')
  await expect(page.getByTestId('prev')).toContainText('Das ist wichtig, weil')
  await expect(page.getByTestId('points')).toContainText('Warum ist das wichtig?')
  await expect(points.nth(1)).toHaveAttribute('data-state', 'current')
  await expect(page.getByTestId('section-row')).toHaveText([/Warum ist das wichtig/, /Gegenmaßnahmen/, /Zusätzliche Ressourcen/])
  await expect(page.locator('[data-testid="slide-row"][data-state="active"]')).toContainText('Bedeutung')
  await shot('05-rehearsal-jump')

  // Rescue: cue first, then full sentence, Esc closes.
  await page.keyboard.press('r')
  await expect(page.getByTestId('rescue-cue')).toBeVisible()
  await shot('06-rescue-cue')
  await page.keyboard.press('r')
  await expect(page.getByTestId('rescue')).toContainText('Kleine Fehlanreize können sich dabei über viele Schritte verstärken.')
  await shot('07-rescue-full')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('current')).toBeVisible()

  // Focus lock freezes the display while tracking continues.
  await page.keyboard.press('f')
  await hear(page, 'u4', asr['s6-2'].asr)
  await expect(page.getByTestId('current')).toContainText('Kleine Fehlanreize')
  await page.keyboard.press('f')
  await expect(page.getByTestId('current')).toContainText('Wenn niemand zuschaut')

  // Return to Begrüßung via its remaining sentence.
  await hear(page, 'u5', asr['s1-3'].asr)
  await expect(page.getByTestId('where')).toContainText('Begrüßung')

  // Dark theme + narrow window.
  await page.evaluate(() => window.presentflow.settings.set({ theme: 'dark' }))
  await page.waitForTimeout(150)
  await shot('08-rehearsal-dark')
  await page.setViewportSize({ width: 560, height: 420 })
  await page.waitForTimeout(150)
  await shot('09-rehearsal-narrow')
  await page.setViewportSize({ width: 1040, height: 620 })

  // Settings drawer.
  await page.getByRole('button', { name: /Einstellungen|Settings/ }).click()
  await expect(page.getByTestId('settings')).toBeVisible()
  await shot('10-settings-appearance')
  await page.getByRole('tab').nth(1).click()
  await page.waitForTimeout(300)
  await shot('11-settings-speech')
  await page.getByRole('tab').nth(2).click()
  await shot('12-settings-shortcuts')
  await page.keyboard.press('Escape')

  // Stop → summary.
  await page.getByTestId('stop').click()
  await expect(page.getByTestId('summary')).toBeVisible()
  await shot('13-summary')

  // Light + high contrast summary.
  await page.evaluate(() => window.presentflow.settings.set({ theme: 'light', highContrast: true }))
  await page.getByRole('button', { name: /Probe fortsetzen|Continue rehearsal/ }).click()
  await page.waitForTimeout(150)
  await shot('14-rehearsal-contrast')

  await app.close()
})

test('a script with only slide headings (PowerPoint import) lists every section, no slide rows', async () => {
  const { app, page } = await launch()
  await page.setViewportSize({ width: 1040, height: 620 })
  await page.getByTestId('new').click()
  const script = ['# Folie 1 — Start', 'Guten Morgen und willkommen.', '# Folie 2 — Hauptteil', 'Hier kommt der Kern.', '# Folie 3 — Ende', 'Vielen Dank fürs Zuhören.']
  await page.getByTestId('script-input').fill(script.join('\n\n'))
  await page.getByTestId('editor-rehearse').click()
  await expect(page.getByTestId('section-row')).toHaveText([/Start/, /Hauptteil/, /Ende/])
  await expect(page.getByTestId('slide-row')).toHaveCount(0)
  await page.screenshot({ path: path.join(shots, '15-rehearsal-single-level.png') })
  await app.close()
})
