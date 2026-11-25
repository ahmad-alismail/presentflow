// Website screenshots (opt-in: PF_SITE_SHOTS=1). English UI, dark theme, an English demo script, injected
// transcripts and a simulated PowerPoint feed. Writes PNGs to site/media/ (or PF_SITE_SHOTS_DIR).
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { hear, launch } from './app'

test.skip(!process.env.PF_SITE_SHOTS, 'opt-in: PF_SITE_SHOTS=1')

const out = process.env.PF_SITE_SHOTS_DIR ?? path.resolve('site/media')
const size = { width: 1200, height: 720 }

const TITLE = 'Keeping AI agents safe'
const SLIDES: [string, [string, string[]][]][] = [
  ['Slide 1 — Opening', [
    ['Welcome', [
      'Good morning, and welcome to my talk on the safety of AI agents.',
      'Today I want to show you why this topic is so urgent right now.',
      'By the end you will know three concrete risks and three countermeasures.'
    ]],
    ['Where we stand', [
      'AI agents no longer answer single questions, they run whole chains of tasks.',
      'They write code, book appointments and control other programs.',
      'So they act more and more on their own, without direct oversight.'
    ]]
  ]],
  ['Slide 2 — Experiments', [
    ['Test environment', [
      'For our study we built a closed test environment.',
      'Twelve different agents received realistic office tasks.',
      'Each agent had access to files, email and a command line.'
    ]],
    ['Competition', [
      'In a second scenario, several agents had to compete for limited computing time.',
      'Some agents started hoarding resources even though that was not their task.'
    ]]
  ]],
  ['Slide 3 — Why it matters', [
    ['Why this matters', [
      'This matters because many AI agents will soon work on complex tasks for long periods.',
      'Small wrong incentives can grow over many steps.',
      'When nobody is watching, such deviations show up late.'
    ]],
    ['Countermeasures', [
      'First, agents should only get the permissions their task really needs.',
      'Second, we need independent logs that make every action traceable.',
      'Third, a human must be able to stop an agent reliably at any time.'
    ]]
  ]],
  ['Slide 4 — Closing', [
    ['Wrap-up', [
      'That brings me to the end of my talk.',
      'Agents are getting more powerful, but we can measure and improve their safety.',
      'I look forward to your questions.'
    ]]
  ]]
]
const SCRIPT = SLIDES.map(([slide, sections]) =>
  [`# ${slide}`, ...sections.map(([title, lines]) => `## ${title}\n${lines.join(' ')}`)].join('\n\n')
).join('\n\n')
const line = (slide: number, section: number, n: number) => SLIDES[slide][1][section][1][n]

const ppt = (page: Page, state: object) => page.evaluate((s) => (window as any).__pf.ppt(s), state)
const show = (slide: number) => ({ connected: true, mode: 'show', slide, count: 4, title: '', file: 'C:\\Talks\\Agent-safety.pptx' })

async function openDemo(followPowerPoint: boolean) {
  fs.mkdirSync(out, { recursive: true })
  const launched = await launch()
  const { page } = launched
  await page.setViewportSize(size)
  await page.evaluate((f) => window.presentflow.settings.set({ uiLanguage: 'en', theme: 'dark', followPowerPoint: f }), followPowerPoint)
  await page.getByTestId('new').click()
  await page.getByPlaceholder(/title/i).fill(TITLE)
  await page.getByTestId('script-input').fill(SCRIPT)
  const shot = async (name: string) => {
    await page.waitForTimeout(400) // let transitions settle
    await page.screenshot({ path: path.join(out, `${name}.png`) })
  }
  return { ...launched, shot }
}

test('site screenshots: editor, rehearsal, jump, settings, summary', async () => {
  const { app, page, shot } = await openDemo(false)
  await page.getByRole('tab', { name: 'Outline' }).click()
  await page.getByTestId('script-input').evaluate((el) => (el.scrollTop = 0))
  await expect(page.locator('.outline-section').first()).toContainText('Welcome')
  await shot('screen-editor')

  await page.getByTestId('editor-rehearse').click()
  await expect(page.getByTestId('current')).toContainText('Good morning')
  await hear(page, 'u1', line(0, 0, 0))
  await hear(page, 'u2', line(0, 0, 1))
  await expect(page.getByTestId('current')).toContainText('three concrete risks')
  await expect(page.getByTestId('prev-older')).toContainText('Good morning')
  await shot('screen-rehearsal')

  // Jump ahead to "Why this matters": the view follows.
  await hear(page, 'u3', line(2, 0, 0))
  await hear(page, 'u4', line(2, 0, 1))
  await expect(page.getByTestId('where')).toContainText('Why this matters')
  await shot('screen-jump')

  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByTestId('settings')).toBeVisible()
  await page.getByRole('tab').nth(1).click()
  await shot('screen-settings')
  await page.keyboard.press('Escape')

  await page.getByTestId('stop').click()
  await expect(page.getByTestId('summary')).toBeVisible()
  await shot('screen-summary')
  await app.close()
})

test('site screenshot: PowerPoint holds at the end of the slide', async () => {
  const { app, page, shot } = await openDemo(true)
  await page.getByTestId('editor-rehearse').click()
  await ppt(page, show(1))
  await expect(page.getByTestId('current')).toContainText('Good morning')
  const said = [line(0, 0, 0), line(0, 0, 1), line(0, 0, 2), line(0, 1, 0), line(0, 1, 1)]
  for (const [i, text] of said.entries()) await hear(page, `s${i}`, text)
  await expect(page.getByTestId('current')).toContainText('without direct oversight')
  await expect(page.getByTestId('slide-end')).toContainText('Experiments')
  await shot('screen-slide-end')
  await app.close()
})
