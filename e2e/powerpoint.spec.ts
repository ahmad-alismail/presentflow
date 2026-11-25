// PowerPoint sync with a simulated PowerPoint feed (no PowerPoint needed), plus editor guide/template.
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { hear, launch } from './app'

const asr: Record<string, { asr: string }> = JSON.parse(fs.readFileSync('test/fixtures/asr-transcripts.json', 'utf8'))
const shots = process.env.PF_SHOTS ?? path.resolve('test-results/screens')
const ppt = (page: import('@playwright/test').Page, state: object) => page.evaluate((s) => (window as any).__pf.ppt(s), state)
const show = (slide: number) => ({ connected: true, mode: 'show', slide, count: 4, title: '', file: 'C:\\Talks\\KI-Sicherheit.pptx' })

test('the slide on screen decides what PresentFlow shows', async () => {
  const { app, page } = await launch()
  await page.setViewportSize({ width: 1040, height: 620 })
  await page.getByTestId('open-sample').click()
  await page.getByTestId('editor-rehearse').click()
  const where = page.getByTestId('where')
  const current = page.getByTestId('current')

  await ppt(page, show(3))
  await expect(where).toContainText('Warum ist das wichtig?')
  await expect(current).toContainText('Das ist wichtig, weil künftig')
  await expect(page.getByTestId('ppt-chip')).toContainText('3')
  await page.screenshot({ path: path.join(shots, 'ppt-01-slide3.png') })

  // Speaking content of slide 2 while slide 3 is shown: checked off quietly, the view stays.
  await hear(page, 'u1', asr['s3-1'].asr)
  await expect(where).toContainText('Warum ist das wichtig?')

  // Presenter clicks to slide 2 → resumes after the already-said sentence.
  await ppt(page, show(2))
  await expect(where).toContainText('Testumgebung')
  await expect(current).toContainText('Darin bekamen zwölf')

  // Speech moves within the slide.
  await hear(page, 'u2', asr['s5-1'].asr)
  await expect(where).toContainText('Shutdown Resistance')

  // A slide without script text: chip dimmed, free tracking.
  await ppt(page, show(9))
  await expect(page.getByTestId('ppt-chip')).toHaveClass(/unmatched/)

  // Settings shows the live link.
  await ppt(page, show(1))
  await page.getByRole('button', { name: /Einstellungen|Settings/ }).click()
  await page.getByRole('tab', { name: 'PowerPoint' }).click()
  await expect(page.getByTestId('ppt-status')).toContainText('KI-Sicherheit.pptx')
  await page.screenshot({ path: path.join(shots, 'ppt-02-settings.png') })
  await page.keyboard.press('Escape')

  // PowerPoint closed → chip disappears.
  await ppt(page, { connected: false })
  await expect(page.getByTestId('ppt-chip')).toHaveCount(0)
  await app.close()
})

test('manual: PresentFlow stays on the slide until the presenter clicks to the next one', async () => {
  const { app, page } = await launch()
  await page.setViewportSize({ width: 1040, height: 620 })
  await page.getByTestId('open-sample').click()
  await page.getByTestId('editor-rehearse').click()
  const where = page.getByTestId('where')
  const current = page.getByTestId('current')

  await ppt(page, show(1))
  await expect(current).toContainText('Guten Morgen')
  for (const c of ['s1-1', 's1-2', 's1-3', 's2-1', 's2-2']) await hear(page, c, asr[c].asr)

  // Last sentence of the slide: no text from slide 2 underneath, just the marked end.
  await expect(current).toContainText('Dadurch handeln sie')
  await expect(page.getByTestId('next')).toHaveCount(0)
  await expect(page.getByTestId('slide-end')).toContainText('Folie 2 — Experimente')
  await page.screenshot({ path: path.join(shots, 'ppt-03-slide-end.png') })

  // Slide finished: a note instead of the next slide's first sentence.
  await hear(page, 's2-3', asr['s2-3'].asr)
  await expect(current).toHaveCount(0)
  await expect(page.getByTestId('slide-done')).toContainText('Folie 2 — Experimente')
  await expect(page.getByTestId('prev')).toContainText('Dadurch handeln sie')
  await page.screenshot({ path: path.join(shots, 'ppt-04-slide-done.png') })

  // Speaking slide 2 before clicking: checked off quietly, PresentFlow stays.
  await hear(page, 's3-1', asr['s3-1'].asr)
  await expect(page.getByTestId('slide-done')).toBeVisible()
  await expect(where).toContainText('Ausgangslage')

  // The click in PowerPoint moves on — after the sentence already said.
  await ppt(page, show(2))
  await expect(where).toContainText('Testumgebung')
  await expect(current).toContainText('Darin bekamen zwölf')

  // A click in PresentFlow's slide list counts as a slide change: slide 4 speech doesn't leave slide 3.
  await page.locator('[data-testid="slide-row"]', { hasText: 'Folie 3' }).click()
  await expect(where).toContainText('Warum ist das wichtig?')
  await hear(page, 's9-1', asr['s9-1'].asr)
  await expect(where).toContainText('Warum ist das wichtig?')
  await expect(current).toContainText('Das ist wichtig, weil künftig')

  // Switching to Automatic releases the hold where the presenter is…
  await page.evaluate(() => window.presentflow.settings.set({ slideAdvance: 'auto' }))
  await expect(page.getByTestId('next')).toBeVisible()
  await expect(where).toContainText('Warum ist das wichtig?')
  // …and back to Manual holds to the slide PowerPoint shows (still slide 2).
  await page.evaluate(() => window.presentflow.settings.set({ slideAdvance: 'manual' }))
  await expect(where).toContainText('Testumgebung')

  // A slide without script text holds too: nothing shown, speech elsewhere doesn't move PresentFlow.
  await ppt(page, show(9))
  await expect(page.getByTestId('slide-done')).toHaveClass(/no-text/)
  await expect(current).toHaveCount(0)
  await hear(page, 's9-2', asr['s9-2'].asr)
  await expect(current).toHaveCount(0)
  await page.screenshot({ path: path.join(shots, 'ppt-06-slide-without-text.png') })
  await ppt(page, show(4))
  await expect(where).toContainText('Überleitung')
  await app.close()
})

test('automatic: speech moves on to the next slide, a PowerPoint click still jumps', async () => {
  const { app, page } = await launch()
  await page.setViewportSize({ width: 1040, height: 620 })
  await page.evaluate(() => window.presentflow.settings.set({ slideAdvance: 'auto' }))
  await page.getByTestId('open-sample').click()
  await page.getByTestId('editor-rehearse').click()
  const where = page.getByTestId('where')

  await ppt(page, show(1))
  for (const c of ['s1-1', 's1-2', 's1-3', 's2-1', 's2-2', 's2-3']) await hear(page, c, asr[c].asr)
  await expect(page.getByTestId('current')).toContainText('Für unsere Studie') // the next slide shows up
  await hear(page, 's3-1', asr['s3-1'].asr)
  await expect(where).toContainText('Testumgebung') // PowerPoint still on slide 1
  await expect(page.getByTestId('ppt-chip')).not.toHaveClass(/unmatched/)

  await ppt(page, show(3))
  await expect(where).toContainText('Warum ist das wichtig?')

  // The setting lives in Settings → PowerPoint.
  await page.getByRole('button', { name: /Einstellungen|Settings/ }).click()
  await page.getByRole('tab', { name: 'PowerPoint' }).click()
  await expect(page.getByTestId('slide-advance').getByRole('button', { pressed: true })).toHaveText(/Automati/)
  await page.screenshot({ path: path.join(shots, 'ppt-05-settings-advance.png') })
  await app.close()
})

test('new presentations start from a template with the structure guide open', async () => {
  const { app, page } = await launch()
  await page.setViewportSize({ width: 1040, height: 620 })
  await page.getByTestId('new').click()
  await expect(page.getByTestId('script-input')).toHaveValue(/# (Folie|Slide) 1/)
  await expect(page.getByTestId('guide')).toBeVisible()
  await page.screenshot({ path: path.join(shots, 'editor-guide.png') })
  await page.getByRole('tab', { name: /Gliederung|Outline/ }).click()
  await expect(page.getByTestId('guide')).toHaveCount(0)
  await app.close()
})
