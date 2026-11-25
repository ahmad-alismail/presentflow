import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseScript } from '@core/script/parse'
import { matchSlide } from '@core/script/slides'
import { parsePptx, pptxToScript } from './pptx'

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const title = (t: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`
const slideXml = (t: string, hidden = false) =>
  `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"${hidden ? ' show="0"' : ''}><p:cSld><p:spTree>${title(t)}</p:spTree></p:cSld></p:sld>`
const notesXml = (paras: string[]) =>
  `<?xml version="1.0"?><p:notes xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>` +
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp>` +
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${paras.join('')}</p:txBody></p:sp>` +
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum" idx="5"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>3</a:t></a:r></a:p></p:txBody></p:sp>` +
  `</p:spTree></p:cSld></p:notes>`
const para = (t: string, bullet = false) => `<a:p>${bullet ? '<a:pPr><a:buChar char="•"/></a:pPr>' : ''}<a:r><a:t>${t}</a:t></a:r></a:p>`
const rels = (items: [string, string, string][]) =>
  `<?xml version="1.0"?><Relationships>${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`

/** Minimal deck: presentation order differs from file names; slide 2 hidden; slide 4 without notes. */
function deck(): Uint8Array {
  return zipSync({
    'ppt/presentation.xml': strToU8(
      `<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId11"/><p:sldId id="257" r:id="rId12"/><p:sldId id="258" r:id="rId13"/><p:sldId id="259" r:id="rId14"/></p:sldIdLst></p:presentation>`
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(
      rels([
        ['rId11', 'slide', 'slides/slide3.xml'],
        ['rId12', 'slide', 'slides/slide1.xml'],
        ['rId13', 'slide', 'slides/slide2.xml'],
        ['rId14', 'slide', 'slides/slide4.xml']
      ])
    ),
    'ppt/slides/slide3.xml': strToU8(slideXml('Einstieg &amp; Ziel')),
    'ppt/slides/slide1.xml': strToU8(slideXml('Geheim', true)),
    'ppt/slides/slide2.xml': strToU8(slideXml('Ergebnisse')),
    'ppt/slides/slide4.xml': strToU8(slideXml('Fragen')),
    'ppt/slides/_rels/slide3.xml.rels': strToU8(rels([['rId1', 'notesSlide', '../notesSlides/notesSlide7.xml']])),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(rels([['rId1', 'notesSlide', '../notesSlides/notesSlide8.xml']])),
    'ppt/slides/_rels/slide2.xml.rels': strToU8(rels([['rId1', 'notesSlide', '../notesSlides/notesSlide9.xml']])),
    'ppt/notesSlides/notesSlide7.xml': strToU8(
      notesXml([para('Guten Morgen und herzlich willkommen.'), '<a:p/>', para('Heute geht es um die &quot;Sicherheit&quot; von KI-Agenten.')])
    ),
    'ppt/notesSlides/notesSlide8.xml': strToU8(notesXml([para('Das wird nicht vorgetragen.')])),
    'ppt/notesSlides/notesSlide9.xml': strToU8(
      notesXml([para('## Zahlen'), para('Drei von zwölf Agenten wehrten sich.'), para('Erstens Rechte', true), para('Zweitens Protokolle', true)])
    ),
    'docProps/core.xml': strToU8('<cp:coreProperties><dc:title>KI-Sicherheit</dc:title></cp:coreProperties>')
  })
}

describe('pptx import', () => {
  it('reads slides in presentation order with titles, notes, hidden flag', () => {
    const slides = parsePptx(deck())
    expect(slides.map((s) => [s.index, s.title, s.hidden])).toEqual([
      [1, 'Einstieg & Ziel', false],
      [2, 'Geheim', true],
      [3, 'Ergebnisse', false],
      [4, 'Fragen', false]
    ])
    expect(slides[0].notes).toEqual(['Guten Morgen und herzlich willkommen.', '', 'Heute geht es um die "Sicherheit" von KI-Agenten.'])
    expect(slides[2].notes).toEqual(['## Zahlen', 'Drei von zwölf Agenten wehrten sich.', '- Erstens Rechte', '- Zweitens Protokolle'])
    expect(slides[3].notes).toEqual([])
  })

  it('builds a numbered script that links back to the PowerPoint slides', () => {
    const { title, source, language } = pptxToScript(deck(), 'datei')
    expect(title).toBe('KI-Sicherheit')
    expect(language).toBe('de')
    expect(source).toBe(
      [
        '# Folie 1 — Einstieg & Ziel',
        'Guten Morgen und herzlich willkommen.',
        '',
        'Heute geht es um die "Sicherheit" von KI-Agenten.',
        '',
        '# Folie 3 — Ergebnisse',
        '## Zahlen',
        '',
        'Drei von zwölf Agenten wehrten sich.',
        '',
        '- Erstens Rechte',
        '- Zweitens Protokolle',
        '',
        '# Folie 4 — Fragen',
        ''
      ].join('\n')
    )
    const script = parseScript(source)
    // Slide 3 (index in PowerPoint, after the hidden slide 2) maps to its own sections.
    const ids = matchSlide(script, { slide: 3 })!
    expect(ids.map((id) => script.sections.find((s) => s.id === id)!.title)).toEqual(['Zahlen'])
    expect(matchSlide(script, { slide: 1 })).not.toBeNull()
    expect(matchSlide(script, { slide: 2 })).toBeNull() // hidden slide: nothing to show
  })
})
