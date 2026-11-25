// Cloud path through the real app against a mock OpenAI Realtime server:
// fake microphone → VAD-mode worker → PCM16 over IPC → main-process client → transcripts → tracker.
import fs from 'node:fs'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { WebSocketServer } from 'ws'
import { launch } from './app'

const PROFILE = path.resolve('.cache/e2e-profile')
const TALK = path.resolve('test/fixtures/audio/talk-dod.wav')
const asr: Record<string, { asr: string }> = JSON.parse(fs.readFileSync('test/fixtures/asr-transcripts.json', 'utf8'))
const ORDER = ['s1-1', 's1-2', 's1-3', 's2-1', 's6-1', 's6-2', 's2-2', 's2-3']

test('OpenAI provider path end to end (mock server)', async () => {
  test.skip(!fs.existsSync(TALK), 'talk audio missing')
  // Mock: each committed turn is "recognized" as the next sentence of the talk, streamed as deltas.
  let turn = 0
  let audioBytes = 0
  const wss = new WebSocketServer({ port: 0 })
  wss.on('connection', (ws, req) => {
    if (req.headers.authorization !== 'Bearer sk-e2e') return ws.close(1008, 'invalid api key')
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'session.update') ws.send(JSON.stringify({ type: 'session.updated', session: msg.session }))
      if (msg.type === 'input_audio_buffer.append') audioBytes += Buffer.from(msg.audio, 'base64').length
      if (msg.type === 'input_audio_buffer.commit' && turn < ORDER.length) {
        const id = `item_${turn}`
        const text = asr[ORDER[turn++]].asr
        const words = text.split(' ')
        words.forEach((w, i) => ws.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: id, delta: (i ? ' ' : '') + w })))
        ws.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text }))
      }
    })
  })
  const port = (wss.address() as AddressInfo).port
  for (const dir of ['presentations', 'sessions']) fs.rmSync(path.join(PROFILE, dir), { recursive: true, force: true })
  fs.rmSync(path.join(PROFILE, 'settings.json'), { force: true })

  const { app, page } = await launch({
    userData: PROFILE,
    env: { PRESENTFLOW_OPENAI_URL: `ws://127.0.0.1:${port}` },
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${TALK}%noloop`]
  })
  await page.evaluate(async () => {
    await window.presentflow.secrets.set('openai', 'sk-e2e')
    await window.presentflow.settings.set({ provider: 'openai', cloudConsent: { openai: true, gemini: false } })
  })
  await page.getByTestId('open-sample').click()
  await page.getByTestId('editor-rehearse').click()
  await page.getByTestId('start').click()
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'listening', { timeout: 60_000 })

  const current = page.getByTestId('current')
  const where = page.getByTestId('where')
  await expect(current).toContainText('Ich möchte Ihnen heute zeigen', { timeout: 30_000 })
  await expect(where).toContainText('Warum ist das wichtig?', { timeout: 60_000 })
  await expect(where).toContainText('Ausgangslage', { timeout: 40_000 })
  await expect(current).toContainText('Für unsere Studie', { timeout: 30_000 })
  expect(turn).toBe(ORDER.length)
  // Only speech is sent (VAD-gated), resampled to 24 kHz: well below the full 100 s of 24 kHz audio.
  expect(audioBytes).toBeGreaterThan(0)
  expect(audioBytes).toBeLessThan(100 * 48000)

  await page.getByTestId('stop').click()
  await app.close()
  wss.close()
})
