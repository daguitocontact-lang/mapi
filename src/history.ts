import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Every saved change of a map becomes an immutable version under
 * `<root>/.mapi-history/<map path>/<timestamp>.mapi` — so anyone can see how a
 * diagram evolved and restore an older one. Identical saves are not duplicated.
 */
const HISTORY_DIR = '.mapi-history'

export type Version = { id: string; at: string }

function versionsDir(root: string, mapPath: string): string {
  return join(root, HISTORY_DIR, mapPath)
}

export function listVersions(root: string, mapPath: string): Version[] {
  const dir = versionsDir(root, mapPath)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mapi'))
    .sort()
    .reverse()
    .map((f) => {
      const id = f.replace(/\.mapi$/, '')
      return { id, at: new Date(Number(id)).toISOString() }
    })
}

/** Snapshot the map's current content unless it equals the latest version. */
export function recordVersion(root: string, mapPath: string): Version | null {
  const source = join(root, mapPath)
  if (!existsSync(source)) return null
  const content = readFileSync(source, 'utf8')
  const latest = listVersions(root, mapPath)[0]
  if (latest && readVersion(root, mapPath, latest.id) === content) return null
  const dir = versionsDir(root, mapPath)
  mkdirSync(dir, { recursive: true })
  const id = String(Date.now())
  writeFileSync(join(dir, `${id}.mapi`), content)
  return { id, at: new Date(Number(id)).toISOString() }
}

export function readVersion(root: string, mapPath: string, id: string): string | null {
  if (!/^\d+$/.test(id)) return null
  const file = join(versionsDir(root, mapPath), `${id}.mapi`)
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

/** Put an old version back as the current map (which itself becomes a new version). */
export function restoreVersion(root: string, mapPath: string, id: string): boolean {
  if (readVersion(root, mapPath, id) === null) return false
  const target = join(root, mapPath)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(versionsDir(root, mapPath), `${id}.mapi`), target)
  return true
}
