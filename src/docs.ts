import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import type { DocRef, MapDocument, MapNode, ParseError } from './model'

// Pure, so the parser (which also runs in browsers) can use it without pulling in node:fs.
export { parseDocRef } from './model'

type Heading = { line: number; name: string; level: number }

// Two kinds of heading open a section: markdown (`## Name`) and the ALL-CAPS labels
// prompts use (`FRAUD RULE:`, `HUMAN REQUEST RULE (CONTAINMENT):`).
const MD_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const CAPS_HEADING = /^([A-Z][A-Z0-9 /&'-]*[A-Z0-9])\s*(?:\([^)]*\))?\s*:\s*$/

function headingsOf(lines: string[]): Heading[] {
  const out: Heading[] = []
  lines.forEach((line, i) => {
    const md = line.match(MD_HEADING)
    if (md) return void out.push({ line: i, name: md[2]!, level: md[1]!.length })
    const caps = line.match(CAPS_HEADING)
    // A caps label only counts at the left margin, so indented "NOTE:" lines stay text.
    if (caps && line === line.trimStart()) out.push({ line: i, name: caps[1]!, level: 1 })
  })
  return out
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase()

export type DocSection = { text: string; /** 1-based line where the section starts. */ line: number }

/**
 * The part of a document a `doc` line points at: from its heading to the next heading of
 * the same or a higher level. No section = the whole document. Null when it isn't there.
 */
export function extractSection(text: string, section: string | null): DocSection | null {
  const lines = text.split(/\r?\n/)
  if (!section) return { text: text.trim(), line: 1 }
  const headings = headingsOf(lines)
  const want = norm(section)
  const start = headings.find((h) => norm(h.name) === want) ?? headings.find((h) => norm(h.name).startsWith(want))
  if (!start) return null
  const next = headings.find((h) => h.line > start.line && h.level <= start.level)
  return { text: lines.slice(start.line, next ? next.line : lines.length).join('\n').trim(), line: start.line + 1 }
}

/** Word-wrapped preview for a sticky note on the canvas; the full text opens on click. */
export function noteExcerpt(text: string, width = 46, maxLines = 8): string {
  const source = text.split('\n')
  // The heading is already the reason the note exists; the note shows what it says.
  if (source.length > 1 && (MD_HEADING.test(source[0]!) || CAPS_HEADING.test(source[0]!))) source.shift()
  const out: string[] = []
  for (const raw of source) {
    const para = raw.trim()
    if (!para) continue
    let line = ''
    for (const word of para.split(/\s+/)) {
      if (line && line.length + 1 + word.length > width) {
        out.push(line)
        line = word
      } else line = line ? `${line} ${word}` : word
    }
    if (line) out.push(line)
    if (out.length > maxLines) break
  }
  if (out.length <= maxLines) return out.join('\n')
  const kept = out.slice(0, maxLines)
  kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/[\s.,;:]+$/, '')} …`
  return kept.join('\n')
}

/** Invisible marker on a note's first line when it is the author's title, not doc text. */
export const NOTE_TITLE = '\u200b'

export type ResolvedDoc = DocSection & { /** Absolute path of the document. */ path: string; section: string | null }

/**
 * Read the document a map points at. Paths are relative to the map's folder and must stay
 * inside `root` (the maps folder), so a map can't make the viewer read arbitrary files.
 */
export function readDocFile(mapPath: string, ref: DocRef, root: string = dirname(mapPath)): ResolvedDoc | null {
  const abs = resolve(dirname(mapPath), ref.path)
  const rel = relative(resolve(root), abs)
  if (rel.startsWith('..') || resolve(root, rel) !== abs) return null
  if (!existsSync(abs) || !statSync(abs).isFile()) return null
  const found = extractSection(readFileSync(abs, 'utf8'), ref.section)
  return found ? { ...found, path: abs, section: ref.section } : null
}

/** The doc a box points at: its own id first, then the short id inside a group (`sfn.guard` → `guard`). */
export function docFor(doc: MapDocument, id: string): DocRef | null {
  return doc.docs[id] ?? doc.docs[id.split('.').pop()!] ?? null
}

/**
 * Fill every `[note]` box with an excerpt of its document. A note with its own label keeps
 * it as the first line. Missing documents come back as warnings; the box keeps its label.
 */
export function resolveNotes(doc: MapDocument, read: (ref: DocRef) => string | null): ParseError[] {
  const warnings: ParseError[] = []
  const walk = (nodes: MapNode[]) => {
    for (const n of nodes) {
      walk(n.children)
      if (n.style !== 'note') continue
      const ref = docFor(doc, n.id)
      if (!ref) continue
      const text = read(ref)
      if (text === null) {
        warnings.push({ line: 0, level: 'warning', message: `${n.id}: doc "${ref.path}${ref.section ? `#${ref.section}` : ''}" not found` })
        continue
      }
      const excerpt = noteExcerpt(text)
      const own = n.label.trim() && n.label !== n.id.split('.').pop() ? n.label : ''
      // NOTE_TITLE marks the note's own label so the renderer can set it apart from the excerpt.
      n.label = [own && NOTE_TITLE + own, excerpt].filter(Boolean).join('\n') || n.label
    }
  }
  walk(doc.nodes)
  return warnings
}
