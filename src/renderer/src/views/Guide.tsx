import type { UiLanguage } from '@shared/types'
import { useApp } from '../store'

interface GuideContent {
  title: string
  points: { heading: string; text: string }[]
  exampleLabel: string
  example: string
}

const GUIDE: Record<UiLanguage, GuideContent> = {
  de: {
    title: 'So bauen Sie Ihr Skript auf',
    points: [
      {
        heading: 'Folien und Abschnitte',
        text: '„# Folie 3 — Titel“ beginnt eine Folie; die Nummer verbindet sie mit Folie 3 in PowerPoint. „## Abschnitt“ gliedert eine Folie in Gesprächspunkte – ideal sind 3–6 Sätze pro Abschnitt.'
      },
      {
        heading: 'Schreiben Sie, was Sie sagen',
        text: 'Ganze Sätze, so wie Sie sie vortragen. Ein Gedanke pro Satz, möglichst unter 25 Wörtern – so erfassen Sie ihn mit einem Blick, und die Erkennung folgt Ihnen sicherer.'
      },
      { heading: 'Stichpunkte und Absätze', text: '„- Stichpunkt“ wird ein einzelner Punkt. Eine Leerzeile beginnt einen neuen Absatz.' },
      {
        heading: 'Gedächtnisstützen',
        text: 'Zu jedem Satz bildet PresentFlow Schlüsselwörter aus dem Satz selbst. In der Gliederung können Sie sie anpassen; sie erscheinen im Hilfe-Modus (Taste R).'
      },
      {
        heading: 'Aus PowerPoint übernehmen',
        text: 'Steht Ihr Text in den Sprechernotizen? Importieren Sie die .pptx-Datei in der Übersicht: Jede Folie wird zu „# Folie N — Titel“, die Notizen werden Ihr Skript.'
      },
      {
        heading: 'Gut erkennbar',
        text: 'Umschreiben ist erlaubt – PresentFlow erkennt auch die Bedeutung. Am sichersten helfen markante Wörter: Namen, Zahlen, Fachbegriffe.'
      }
    ],
    exampleLabel: 'Beispiel',
    example:
      '# Folie 2 — Experimente\n\n## Testumgebung\nFür unsere Studie haben wir eine Testumgebung aufgebaut.\nDarin bekamen zwölf Agenten realistische Büroaufgaben.\n\n## Ergebnis\n- Drei Agenten verzögerten die Abschaltung'
  },
  en: {
    title: 'How to structure your script',
    points: [
      {
        heading: 'Slides and sections',
        text: '“# Slide 3 — Title” starts a slide; the number links it to slide 3 in PowerPoint. “## Section” splits a slide into talking points – 3–6 sentences per section work best.'
      },
      {
        heading: 'Write what you will say',
        text: 'Full sentences, the way you say them. One idea per sentence, ideally under 25 words – you take it in at a glance, and recognition follows you more reliably.'
      },
      { heading: 'Bullets and paragraphs', text: '“- Bullet” becomes a single point. A blank line starts a new paragraph.' },
      {
        heading: 'Memory cues',
        text: 'For every sentence PresentFlow picks keywords from the sentence itself. Adjust them in the outline; they appear in help mode (key R).'
      },
      {
        heading: 'Bring it over from PowerPoint',
        text: 'Is your text in the speaker notes? Import the .pptx file in the overview: every slide becomes “# Slide N — Title” and its notes become your script.'
      },
      {
        heading: 'Easy to recognize',
        text: 'Paraphrasing is fine – PresentFlow also recognizes meaning. Distinctive words help most: names, numbers, technical terms.'
      }
    ],
    exampleLabel: 'Example',
    example:
      '# Slide 2 — Experiments\n\n## Test environment\nFor our study we built a closed test environment.\nTwelve agents received realistic office tasks.\n\n## Result\n- Three agents delayed the shutdown'
  }
}

/** Starter skeleton for "New presentation". */
export const TEMPLATES: Record<UiLanguage, string> = {
  de: `# Folie 1 — Einstieg

## Begrüßung
Guten Morgen und herzlich willkommen zu meinem Vortrag.
Heute zeige ich Ihnen, warum dieses Thema wichtig ist.

## Überblick
Ich spreche über drei Punkte.

# Folie 2 — Hauptteil

## Erster Punkt
Hier steht der erste Gedanke, so wie Sie ihn sagen.
- Ein Stichpunkt wird ein einzelner Punkt

# Folie 3 — Abschluss

## Fazit
Zum Schluss fasse ich das Wichtigste zusammen.
`,
  en: `# Slide 1 — Opening

## Welcome
Good morning and welcome to my talk.
Today I will show you why this topic matters.

## Overview
I will cover three points.

# Slide 2 — Main part

## First point
Write your first idea here, the way you will say it.
- A bullet becomes a single point

# Slide 3 — Closing

## Summary
Finally, I sum up the key message.
`
}

export function isTemplate(source: string): boolean {
  return source.trim() === '' || Object.values(TEMPLATES).some((t) => t.trim() === source.trim())
}

export function Guide() {
  const lang = useApp((s) => s.settings.uiLanguage)
  const g = GUIDE[lang]
  return (
    <div className="guide" data-testid="guide">
      <h3>{g.title}</h3>
      {g.points.map((p) => (
        <div key={p.heading} className="guide-point">
          <strong>{p.heading}</strong>
          <p>{p.text}</p>
        </div>
      ))}
      <div className="guide-point">
        <strong>{g.exampleLabel}</strong>
        <pre className="guide-example">{g.example}</pre>
      </div>
    </div>
  )
}
