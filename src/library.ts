import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, normalize, relative, sep } from 'node:path'

/** Folders that hold maps but aren't part of the documentation tree. */
const HIDDEN_DIRS = new Set(['archivo', '.mapi-history', 'node_modules'])

export type LibraryEntry = {
  /** Path relative to the library root, with `/` separators — the map's identity. */
  path: string
  /** File name without `.mapi` — what `[map=name]` links use. */
  name: string
  title: string
  /** `architecture` or `flow` — the sidebar shows a different icon for each. */
  kind: string
  /** Section folders, top-down (e.g. ["Clientes", "Acme"]). */
  section: string[]
}

/** "3-clientes" → "Clientes", "acme-corp" → "Acme Corp" (number prefix only orders). */
export function sectionLabel(folder: string): string {
  const words = folder.replace(/^\d+-/, '').split('-')
  const label = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return label
}

function readHeader(abs: string, fallback: string): { title: string; kind: string } {
  const lines = readFileSync(abs, 'utf8').split('\n')
  const title = lines.find((l) => l.startsWith('title '))?.slice(6).trim() ?? fallback
  const kind = lines.find((l) => l.startsWith('kind '))?.slice(5).trim() ?? 'flow'
  return { title, kind }
}

export function listLibrary(root: string): LibraryEntry[] {
  const out: LibraryEntry[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.') || HIDDEN_DIRS.has(name)) continue
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) {
        walk(abs)
        continue
      }
      if (!name.endsWith('.mapi')) continue
      const rel = relative(root, abs).split(sep).join('/')
      const folders = rel.split('/').slice(0, -1)
      out.push({ path: rel, name: basename(name, '.mapi'), ...readHeader(abs, name), section: folders.map(sectionLabel) })
    }
  }
  walk(root)
  return out
}

/**
 * Turn a `file` request into a safe path inside the library: either a relative path
 * ("2-codigo/recorte.mapi") or a bare map name from a `[map=…]` link ("recorte").
 * Anything escaping the root is rejected.
 */
export function resolveMapPath(root: string, requested: string): string | null {
  if (!requested) return null
  if (!requested.includes('/')) {
    const name = basename(requested, '.mapi')
    return listLibrary(root).find((e) => e.name === name)?.path ?? null
  }
  const clean = normalize(requested).split(sep).join('/')
  if (clean.startsWith('..') || clean.startsWith('/') || !clean.endsWith('.mapi')) return null
  return clean
}
