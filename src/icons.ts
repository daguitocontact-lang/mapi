import { createRequire } from 'node:module'

type IconSet = {
  prefix: string
  width?: number
  height?: number
  icons: Record<string, { body: string; width?: number; height?: number }>
  aliases?: Record<string, { parent: string }>
}

// Iconify sets ship inside their packages, so icons render offline. "logos" has brand and
// AWS service logos (`[icon=aws-lambda]`); "lucide" has plain line glyphs for generic
// things — users, factory, database (`[icon=lucide:users]`), drawn in the text colour.
const require = createRequire(import.meta.url)
const SETS: Record<string, IconSet> = {
  logos: require('@iconify-json/logos/icons.json') as IconSet,
  lucide: require('@iconify-json/lucide/icons.json') as IconSet,
}

export type Icon = { body: string; width: number; height: number }

export function getIcon(name: string): Icon | null {
  const [prefix, key] = name.includes(':') ? (name.split(':', 2) as [string, string]) : ['logos', name]
  const set = SETS[prefix]
  if (!set) return null
  const id = set.icons[key] ? key : set.aliases?.[key]?.parent
  const icon = id ? set.icons[id] : undefined
  if (!icon) return null
  return { body: icon.body, width: icon.width ?? set.width ?? 24, height: icon.height ?? set.height ?? 24 }
}
