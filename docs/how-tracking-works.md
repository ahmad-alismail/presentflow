# How tracking works

`src/core/tracking/tracker.ts` is a deterministic, unit-tested engine:

- **Every heard word explains at most one script sentence.** Words go first to what is on screen
  (current + next sentences), then to the sentence just finished. Only words nothing on screen explains
  count as evidence for a jump elsewhere. This makes it resistant to false jumps, prevents double counting
  of repeats, and completes the previous sentence with its trailing words.
- **Lexical + semantic evidence.** Fuzzy, IDF-weighted word matching (German compounds, inflections, ASR
  slips, number words) plus multilingual sentence embeddings for paraphrases. Semantics confirm candidates but
  never trigger a jump alone.
- **Confidence-aware navigation.** Displayed sentences are covered at a lower bar; jumps need strong evidence
  and confirmation by further speech. Each section keeps its own cursor (high-water mark) and coverage.
- **Stable display.** Re-transcribing engines (local Whisper, Gemini interim text) pass through
  LocalAgreement-2: only words two consecutive hypotheses agree on reach the tracker, so the view never
  moves backwards.
- **Partial coverage.** Sentences are split into clauses; a sentence whose meaningful clause was skipped is
  kept open with just the missing fragment shown.

## PowerPoint sync

A small background Windows PowerShell process reads the current slide through PowerPoint's automation
interface (COM) a few times per second while a rehearsal is open (`src/main/powerpoint.ts`). No add-in and
no native modules are needed, and PowerPoint can be closed normally at any time.

Slides are matched by the number in the heading (`# Folie 6 — …`, `# Slide 6: …`, `6. …`), otherwise by
slide title, otherwise by order if the script has no numbers and the same number of slides.

## Architecture

```
Renderer                                         Main process
  AudioWorklet 16 kHz ─► speech.worker             window: bounds memory, always-on-top (above slideshows),
    Silero VAD (all providers)                      opacity, high-performance GPU, no background throttling
    Whisper turbo on WebGPU (local)                store: JSON in %APPDATA%/presentflow (atomic writes)
  embed.worker (multilingual MiniLM, CPU)          secrets: DPAPI-encrypted API keys
  StableTranscript → Tracker → Zustand → React     cloud/: OpenAI Realtime + Gemini Live clients
                                                   (reconnect, buffering, session rotation)
```

| Folder | Contents |
|---|---|
| `src/core/` | Pure TypeScript: script parsing, text normalization, memory cues, the tracker |
| `src/main/` | Electron main process: window, storage, secrets, shortcuts, PowerPoint, `.pptx` import, cloud clients |
| `src/preload/` | The typed bridge between main and renderer |
| `src/renderer/` | React UI, speech workers, rehearsal session |
| `src/shared/` | Types and IPC channel names used by both sides |

The full product requirements are in [product-spec.md](product-spec.md).
