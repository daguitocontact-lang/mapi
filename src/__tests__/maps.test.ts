import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { viewDocument } from '../focus'
import { layoutMap } from '../layout'
import { listLibrary } from '../library'
import { parseMapi } from '../parse'

const ROOT = join(import.meta.dir, '..', '..', 'examples')

/** Every level of a map (root and each drill-in), with and without context. */
async function everyView(path: string) {
  const { doc } = parseMapi(readFileSync(join(ROOT, path), 'utf8'))
  const seen = new Set<string | null>()
  const stack: Array<string | null> = [null]
  const views: Array<{ focus: string | null; context: boolean; overlaps: string[]; crossings: number }> = []
  while (stack.length > 0) {
    const focus = stack.pop()!
    if (seen.has(focus)) continue
    seen.add(focus)
    for (const context of [false, true]) {
      const view = viewDocument(doc, { focusId: focus, context })
      const placed = await layoutMap(view.doc, { drillable: view.drillable })
      views.push({ focus, context, crossings: placed.crossings, overlaps: placed.overlaps.map((o) => `${o.kind}: ${o.a} × ${o.b}`) })
      if (!context) stack.push(...[...view.drillable].filter((id) => !seen.has(id)))
    }
  }
  return views
}

describe('every library map', () => {
  for (const entry of listLibrary(ROOT)) {
    test(`${entry.path} draws nothing on top of anything, at every level`, async () => {
      const views = await everyView(entry.path)
      const broken = views.filter((v) => v.overlaps.length > 0)
      expect(broken).toEqual([])
    }, 60_000)
  }
})

// Readability budgets for the maps the team reviews: a regression shows up here, not in a screenshot.
const CROSSING_BUDGET: Record<string, number> = {
  '1-demo/payments.mapi': 0,
  '2-reference/kelvin-aws.mapi': 1,
}

describe('reviewed maps stay readable', () => {
  for (const [path, budget] of Object.entries(CROSSING_BUDGET)) {
    test(`${path} keeps at most ${budget} crossing(s) at the root`, async () => {
      const { doc } = parseMapi(readFileSync(join(ROOT, path), 'utf8'))
      const view = viewDocument(doc, { focusId: null, context: false })
      const placed = await layoutMap(view.doc, { drillable: view.drillable })
      expect(placed.crossings).toBeLessThanOrEqual(budget)
    }, 60_000)
  }
})
