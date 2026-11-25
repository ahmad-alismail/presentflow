# Development

Requirements: Windows 10 or 11, Node.js 22.12 or newer, Git. Python is only needed to regenerate test audio.

```bash
npm install
npm run dev        # run the app with hot reload
npm run dist       # Windows installer + portable exe in release/
```

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit + scenario tests (tracker with real Whisper transcripts, lexical and semantic mode; parser; cloud protocol against mock servers) |
| `npm run typecheck` | TypeScript (main/preload, renderer, e2e) |
| `npm run e2e` | Builds must exist (`npm run build`). UI flow, real-audio pipeline, cloud path via mock server |
| `PF_OFFLINE=1 npx playwright test e2e/audio.spec.ts` | Real-audio test with all network blocked |
| `PF_EXE=release/win-unpacked/PresentFlow.exe npm run e2e` | Same E2E suites against the packaged build (driven over CDP) |
| `PF_PPT_LIVE=1 npx playwright test e2e/powerpoint.live.spec.ts` | Live PowerPoint sync test: opens PowerPoint with a temporary deck, closes it without saving |
| `PF_SITE_SHOTS=1 npx playwright test e2e/site-screens.spec.ts` | Regenerates the website screenshots in `site/media/` (dark theme, English UI) |
| `npm run calibrate` | Prints semantic similarity distributions for threshold tuning |

## Test audio

Test audio is synthesized with the Windows German voice:

```bash
python scripts/make-talk-clips.py
powershell -File scripts/tts.ps1 -Clips test/fixtures/talk-clips.json -OutDir test/fixtures/audio
python scripts/make-talk-wav.py test/fixtures/audio/talk-dod.wav s1-1 s1-2 s1-3 s2-1 s6-1 s6-2 s2-2 s2-3
```

## Website

The project website lives in `site/` (plain HTML, CSS and JavaScript, no build step). Preview it with any
static server, for example `npx serve site`. Pushing changes under `site/` to `main` deploys it to GitHub
Pages via `.github/workflows/pages.yml`.

## First rehearsal with your own voice (checklist)

The pipeline is verified with synthesized German speech; real voices add accents and hesitations.
On your first real rehearsal, check:

1. The status dot turns green and gets a halo while you speak (it hears you).
2. A sentence spoken naturally disappears within about one second after you finish it.
3. Paraphrasing a sentence still advances (may take a moment longer).
4. Jumping to another section: the display follows after one or two sentences there.
5. Saying "äh", pausing, or a short off-topic remark changes nothing.

If something misbehaves, the summary (Stop) shows exactly what was recognized as said and what is open.
