import { describe, expect, it } from 'vitest'
import { StableTranscript } from './stableTranscript'

const partial = (text: string) => ({ utteranceId: 'u1', kind: 'partial' as const, text })

describe('StableTranscript (LocalAgreement-2)', () => {
  it('releases only words two consecutive hypotheses agree on', () => {
    const st = new StableTranscript()
    expect(st.push(partial('Wir untersuchen ob'))).toBeNull()
    expect(st.push(partial('Wir untersuchen, ob sich'))).toEqual({ utteranceId: 'u1', text: 'Wir untersuchen, ob', final: false })
    expect(st.push(partial('Wir untersuchen, ob sich Karriere'))).toEqual({ utteranceId: 'u1', text: 'Wir untersuchen, ob sich', final: false })
    // A revision of the unstable tail does not retract anything.
    expect(st.push(partial('Wir untersuchen, ob sich KI-Agenten gegen'))).toBeNull()
    expect(st.push(partial('Wir untersuchen, ob sich KI-Agenten gegen das'))?.text).toBe('Wir untersuchen, ob sich KI-Agenten gegen')
  })
  it('passes finals through and resets the utterance', () => {
    const st = new StableTranscript()
    st.push(partial('a b'))
    expect(st.push({ utteranceId: 'u1', kind: 'final', text: 'a b c.' })).toEqual({ utteranceId: 'u1', text: 'a b c.', final: true })
    expect(st.push(partial('x'))).toBeNull()
  })
  it('passes append-only providers straight through', () => {
    const st = new StableTranscript()
    expect(st.push(partial('Hallo zusammen'), true)?.text).toBe('Hallo zusammen')
  })
  it('ignores empty finals', () => {
    expect(new StableTranscript().push({ utteranceId: 'u1', kind: 'final', text: '  ' })).toBeNull()
  })
})
