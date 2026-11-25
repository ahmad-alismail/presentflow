// README screenshot (opt-in: PF_SITE_SHOTS=1). English UI, dark theme, an English demo script and injected
// transcripts. Writes site/media/screen-rehearsal.png (or into PF_SITE_SHOTS_DIR). The same talk drives the
// website demo (site/assets/demo.js).
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
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

async function openDemo() {
  fs.mkdirSync(out, { recursive: true })
  const launched = await launch()
  const { page } = launched
  await page.setViewportSize(size)
  await page.evaluate(() => window.presentflow.settings.set({ uiLanguage: 'en', theme: 'dark', followPowerPoint: false }))
  await page.getByTestId('new').click()
  await page.getByPlaceholder(/title/i).fill(TITLE)
  await page.getByTestId('script-input').fill(SCRIPT)
  const shot = async (name: string) => {
    await page.waitForTimeout(400) // let transitions settle
    await page.screenshot({ path: path.join(out, `${name}.png`) })
  }
  return { ...launched, shot }
}

test('README screenshot: following a talk', async () => {
  const { app, page, shot } = await openDemo()
  await page.getByTestId('editor-rehearse').click()
  await expect(page.getByTestId('current')).toContainText('Good morning')
  await hear(page, 'u1', line(0, 0, 0))
  await hear(page, 'u2', line(0, 0, 1))
  await expect(page.getByTestId('current')).toContainText('three concrete risks')
  await expect(page.getByTestId('prev-older')).toContainText('Good morning')
  await shot('screen-rehearsal')
  await app.close()
})
