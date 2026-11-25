import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { CloudEvent, CloudStartOptions, TranscriptEvent } from '@shared/types'
import type { Secrets } from '../secrets'
import { GeminiLive } from './geminiLive'
import type { CloudStatus, LiveSocket } from './liveSocket'
import { OpenAiRealtime } from './openaiRealtime'

/** Cloud speech runs in the main process: API keys never reach the renderer. */
export function registerCloudIpc(win: BrowserWindow, secrets: Secrets): void {
  let client: LiveSocket | null = null
  const emit = (e: CloudEvent) => {
    if (!win.isDestroyed()) win.webContents.send(IPC.cloudEvent, e)
  }
  const callbacks = {
    transcript: (event: TranscriptEvent) => emit({ type: 'transcript', event }),
    status: (state: CloudStatus, detail?: string) => emit({ type: 'status', state, detail })
  }

  ipcMain.handle(IPC.cloudStart, async (_e, opts: CloudStartOptions) => {
    await client?.stop()
    client = null
    const apiKey = secrets.get(opts.provider)
    if (!apiKey) {
      emit({ type: 'status', state: 'failed', detail: 'no-key' })
      return
    }
    const common = { apiKey, model: opts.model, language: opts.language, vocabulary: opts.vocabulary }
    // Endpoint overrides exist for end-to-end tests against local mock servers.
    client =
      opts.provider === 'openai'
        ? new OpenAiRealtime({ ...common, url: process.env.PRESENTFLOW_OPENAI_URL }, callbacks)
        : new GeminiLive({ ...common, url: process.env.PRESENTFLOW_GEMINI_URL }, callbacks)
    client.start()
  })
  ipcMain.on(IPC.cloudAudio, (_e, chunk: ArrayBuffer) => client?.audio(Buffer.from(chunk)))
  ipcMain.on(IPC.cloudCommit, () => client?.commit())
  ipcMain.handle(IPC.cloudStop, async () => {
    await client?.stop()
    client = null
  })
}
