// Vertical slice: real audio through the real pipeline (fake microphone = WAV file):
// getUserMedia → AudioWorklet → Silero VAD → Whisper (WebGPU) → LocalAgreement → tracker → UI.
// Scenario = Definition of Done: speak in order, jump to another section, return, finish.
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { launch } from './app'

// Persistent profile so the Whisper model (~760 MB) is downloaded only once.
const PROFILE = path.resolve('.cache/e2e-profile')
const TALK = path.resolve('test/fixtures/audio/talk-dod.wav')
const shots = process.env.PF_SHOTS ?? path.resolve('test-results/screens')

test('Definition of Done with the local provider and real audio', async () => {
  test.skip(!fs.existsSync(TALK), 'run: python scripts/make-talk-wav.py test/fixtures/audio/talk-dod.wav s1-1 s1-2 s1-3 s2-1 s6-1 s6-2 s2-2 s2-3')
  for (const dir of ['presentations', 'sessions']) fs.rmSync(path.join(PROFILE, dir), { recursive: true, force: true })
  fs.rmSync(path.join(PROFILE, 'settings.json'), { force: true })

  const { app, page } = await launch({
    userData: PROFILE,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${TALK}%noloop`,
      // PF_OFFLINE=1: every network request fails → proves models load from the local cache.
      ...(process.env.PF_OFFLINE ? ['--proxy-server=127.0.0.1:9', '--proxy-bypass-list=<-loopback>'] : [])
    ]
  })
  const statuses: string[] = []
  page.on('console', (m) => statuses.push(m.text()))
  await page.setViewportSize({ width: 1040, height: 620 })
  await page.getByTestId('open-sample').click()
  await page.getByTestId('editor-rehearse').click()
  await expect(page.getByTestId('current')).toContainText('Guten Morgen')

  const t0 = Date.now()
  await page.getByTestId('start').click()
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'listening', { timeout: 240_000 })
  console.log(`model ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`)

  const current = page.getByTestId('current')
  const where = page.getByTestId('where')
  // In order through Begrüßung.
  await expect(current).toContainText('Ich möchte Ihnen heute zeigen', { timeout: 30_000 })
  await expect(current).toContainText('Am Ende werden Sie drei', { timeout: 30_000 })
  await expect(where).toContainText('Ausgangslage', { timeout: 30_000 })
  await expect(current).toContainText('Sie schreiben Code', { timeout: 30_000 })
  // Unexpected jump to "Warum ist das wichtig?" — Ausgangslage keeps its unfinished state.
  await expect(where).toContainText('Warum ist das wichtig?', { timeout: 30_000 })
  await expect(current).toContainText('Wenn niemand zuschaut', { timeout: 30_000 })
  await page.screenshot({ path: path.join(shots, 'audio-01-after-jump.png') })
  // Return to Ausgangslage: remembers what was said, shows the remaining sentence.
  await expect(where).toContainText('Ausgangslage', { timeout: 30_000 })
  await expect(current).toContainText('Dadurch handeln sie', { timeout: 30_000 })
  // Finish Ausgangslage → continuation into Testumgebung, section 6 still remembers its open sentence.
  await expect(current).toContainText('Für unsere Studie', { timeout: 30_000 })
  await page.screenshot({ path: path.join(shots, 'audio-02-end.png') })

  const view = await page.evaluate(() => (window as any).__pf.state().view)
  const byTitle = (title: string) => view.sections[['Begrüßung', 'Ausgangslage', 'Testumgebung', 'Konkurrenz', 'Shutdown Resistance', 'Warum ist das wichtig?'].indexOf(title)]
  expect(byTitle('Begrüßung').status).toBe('done')
  expect(byTitle('Ausgangslage').status).toBe('done')
  expect(byTitle('Warum ist das wichtig?').remaining).toHaveLength(1)
  console.log(`talk tracked in ${((Date.now() - t0) / 1000).toFixed(1)} s`)

  await page.getByTestId('stop').click()
  await expect(page.getByTestId('summary')).toBeVisible()
  await app.close()
})
