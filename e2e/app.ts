import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, chromium, type Page } from '@playwright/test'

export interface Launched {
  app: { close(): Promise<void> }
  page: Page
  userData: string
}

interface LaunchOptions {
  args?: string[]
  userData?: string
  env?: Record<string, string>
}

/**
 * Launch the app with an isolated profile. Extra Chromium switches (e.g. fake audio) via `args`.
 * PF_EXE=path\to\PresentFlow.exe runs the same tests against a packaged build.
 */
export async function launch(opts: LaunchOptions = {}): Promise<Launched> {
  const userData = opts.userData ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pf-e2e-'))
  const env = { ...process.env, PRESENTFLOW_USER_DATA: userData, PRESENTFLOW_TEST: '1', ...opts.env } as Record<string, string>
  const exe = process.env.PF_EXE
  const launched = exe ? await launchPackaged(exe, opts.args ?? [], env) : await launchDev(opts.args ?? [], env)
  const { page } = launched
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('console', (m) => m.type() === 'error' && console.log('[console.error]', m.text()))
  await page.waitForSelector('.app')
  return { ...launched, userData }
}

async function launchDev(args: string[], env: Record<string, string>) {
  const app = await electron.launch({ args: ['.', ...args], env })
  return { app, page: await app.firstWindow() }
}

/**
 * Playwright's Electron launcher cannot attach to packaged apps (it needs to inject its loader
 * script), so packaged builds are driven over the Chrome DevTools Protocol instead.
 */
async function launchPackaged(exe: string, args: string[], env: Record<string, string>) {
  const port = 9300 + Math.floor(Math.random() * 600)
  const proc = spawn(exe, [`--remote-debugging-port=${port}`, ...args], { env, stdio: 'ignore' })
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null
  for (let i = 0; i < 150 && !browser; i++) {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null)
    if (!browser) await new Promise((r) => setTimeout(r, 200))
  }
  if (!browser) {
    proc.kill()
    throw new Error(`could not attach to ${exe}`)
  }
  const context = browser.contexts()[0]
  const page = context.pages().find((p) => p.url().startsWith('app://')) ?? (await context.waitForEvent('page'))
  return {
    page,
    app: {
      close: async () => {
        await browser!.close().catch(() => undefined)
        proc.kill()
        await new Promise((r) => setTimeout(r, 1500)) // let the single-instance lock go
      }
    }
  }
}

export async function hear(page: Page, id: string, text: string, final = true) {
  await page.evaluate(([i, t, f]) => (window as any).__pf.hear(i, t, f), [id, text, final] as const)
}
