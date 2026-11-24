import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractSection, noteExcerpt, parseDocRef, readDocFile, resolveNotes } from '../docs'
import { parseMapi } from '../parse'
import { renderMap } from '../render-map'

const PROMPT = [
  'ROLE:',
  'You are the agent.',
  '',
  'FRAUD RULE:',
  'If the user reports unauthorized access,',
  'search the knowledge base and respond.',
  '',
  'HUMAN REQUEST RULE (CONTAINMENT, NO REDIRECTION):',
  'Do not escalate.',
  '  NOTE: indented caps labels are text.',
  '',
  '## Markdown part',
  'Intro.',
  '### Child',
  'Detail.',
  '## Next',
  'Other.',
].join('\n')

describe('doc references', () => {
  test('split the file from the section', () => {
    expect(parseDocRef('prompt/a.txt#FRAUD RULE')).toEqual({ path: 'prompt/a.txt', section: 'FRAUD RULE' })
    expect(parseDocRef('notes.md')).toEqual({ path: 'notes.md', section: null })
  })

  test('the parser keeps one doc per box id', () => {
    const { doc, errors } = parseMapi('kind architecture\nsummary s\na: A\ndoc a prompt.txt#ROLE\n')
    expect(doc.docs.a).toEqual({ path: 'prompt.txt', section: 'ROLE' })
    expect(errors).toEqual([])
  })

  test('a doc for an unknown box is flagged', () => {
    const { errors } = parseMapi('kind architecture\nsummary s\na: A\ndoc b prompt.txt\n')
    expect(errors.some((e) => e.message.includes('unknown box "b"'))).toBe(true)
  })

  test('[note] is a node style', () => {
    expect(parseMapi('kind architecture\nn: Note [note]\n').doc.nodes[0]!.style).toBe('note')
  })
})

describe('sections', () => {
  test('a caps label runs to the next caps label', () => {
    const s = extractSection(PROMPT, 'FRAUD RULE')!
    expect(s.text).toBe('FRAUD RULE:\nIf the user reports unauthorized access,\nsearch the knowledge base and respond.')
    expect(s.line).toBe(4)
  })

  test('labels with a parenthesis match by their name, and indented caps stay inside', () => {
    const s = extractSection(PROMPT, 'human request rule')!
    expect(s.text.startsWith('HUMAN REQUEST RULE (CONTAINMENT')).toBe(true)
    expect(s.text).toContain('NOTE: indented caps labels are text.')
  })

  test('a markdown heading keeps its children until a heading of the same level', () => {
    const s = extractSection(PROMPT, 'Markdown part')!
    expect(s.text).toBe('## Markdown part\nIntro.\n### Child\nDetail.')
  })

  test('no section = the whole document; a missing one = null', () => {
    expect(extractSection('a\nb', null)!.text).toBe('a\nb')
    expect(extractSection(PROMPT, 'NOPE')).toBeNull()
  })
})

describe('notes', () => {
  test('the excerpt drops the heading, wraps and cuts with an ellipsis', () => {
    expect(noteExcerpt('FRAUD RULE:\nSearch the base.')).toBe('Search the base.')
    const long = noteExcerpt(Array.from({ length: 60 }, (_, i) => `word${i}`).join(' '), 20, 3)
    expect(long.split('\n')).toHaveLength(3)
    expect(long.endsWith('…')).toBe(true)
  })

  test('a [note] box gets the excerpt under its own label', () => {
    const { doc } = parseMapi('kind architecture\nn: Fraude [note]\nm: [note]\ndoc n p.txt#FRAUD RULE\ndoc m p.txt#ROLE\n')
    const warnings = resolveNotes(doc, (ref) => extractSection(PROMPT, ref.section)?.text ?? null)
    expect(warnings).toEqual([])
    expect(doc.nodes[0]!.label.split('\n')[0]).toBe('\u200bFraude')
    expect(doc.nodes[0]!.label).toContain('unauthorized access')
    expect(doc.nodes[1]!.label).toBe('You are the agent.')
  })

  test('a missing document is a warning, not an error', () => {
    const { doc } = parseMapi('kind architecture\nn: N [note]\ndoc n gone.txt\n')
    expect(resolveNotes(doc, () => null)[0]!.message).toContain('gone.txt')
  })
})

describe('reading files', () => {
  const root = mkdtempSync(join(tmpdir(), 'mapi-docs-'))
  mkdirSync(join(root, 'maps'))
  writeFileSync(join(root, 'maps', 'prompt.txt'), PROMPT)
  writeFileSync(join(root, 'secret.txt'), 'outside')
  const map = join(root, 'maps', 'flow.mapi')

  test('paths are relative to the map', () => {
    expect(readDocFile(map, { path: 'prompt.txt', section: 'ROLE' }, join(root, 'maps'))!.text).toBe('ROLE:\nYou are the agent.')
  })

  test('nothing outside the maps folder is read', () => {
    expect(readDocFile(map, { path: '../secret.txt', section: null }, join(root, 'maps'))).toBeNull()
  })

  test('the SVG marks boxes that have a document', async () => {
    const source = 'kind flow\nsummary s\na: A\nb: B [note]\n1 a -> b: lee\ndoc a prompt.txt#ROLE\ndoc b prompt.txt#FRAUD RULE\n'
    const r = await renderMap(source, { readDoc: (ref) => readDocFile(map, ref, join(root, 'maps'))?.text ?? null })
    expect(r.svg).toContain('data-doc="a"')
    expect(r.svg).toContain('data-doc="b"')
    expect(r.svg).toContain('unauthorized access')
    expect(r.errors).toEqual([])
  })
})
