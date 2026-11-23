import { describe, expect, test } from 'bun:test'
import { renderMap } from '../render-map'
import { expandClones } from '../clones'
import { returnEdges } from '../layout/grid'
import { parseMapi } from '../parse'

describe('[clone] reference chips', () => {
  test('replaces each line to a shared box with a chip attached to its user', () => {
    const { doc } = parseMapi('kind architecture\nvk: Cache [store, clone]\napi: API [col=1]\nworker: Worker [col=2]\napi -> vk: queues\nworker -> vk: counters\n')
    const out = expandClones(doc)
    const chips = out.nodes.filter((n) => n.cloneOf === 'vk')
    expect(chips.map((c) => c.attachedTo).sort()).toEqual(['api', 'worker'])
    expect(out.edges.some((e) => e.to === 'vk' || e.to.startsWith('vk~'))).toBe(false)
    expect(chips.every((c) => c.copies === 2)).toBe(true)
  })
})

describe('return lines', () => {
  test('marks the line that goes back toward the entries, not the forward ones', () => {
    const { doc } = parseMapi('kind architecture\next: Entry\nlb: Load balancer\ning: Ingestion\nworker: Worker\next -> lb\nlb -> ing\ning -> worker\nworker -> lb\n')
    const back = [...returnEdges(doc.nodes, doc.edges)].map((e) => `${e.from}->${e.to}`)
    expect(back).toEqual(['worker->lb'])
  })
})

describe('groups whose lines go to the boxes inside', () => {
  // People → Web (a group, lines to its boxes) → balancer → API (a group with chips).
  const source = [
    'kind architecture',
    'pay: Payments [clone, external]',
    'mail: Mail [clone, external]',
    'people: People [actor, top, col=1]',
    'web: Web [col=1] {',
    '  site: Site',
    '  app: App',
    '}',
    'prod: Production [col=2] {',
    '  lb: Balancer',
    '  api: API',
    '}',
    'people -> web.app',
    'people -> web.site',
    'web.app -> prod.lb',
    'prod.lb -> prod.api',
    'prod.api -> pay',
    'prod.api -> mail',
  ].join('\n')

  test('a group follows the line flow instead of sinking to the aside row', async () => {
    // Every line of the Web group goes to a box inside it; it feeds the balancer below.
    const flow = [
      'kind architecture',
      'people: People [actor, top, col=1]',
      'web: Web [col=1] {',
      '  app: App',
      '}',
      'lb: Balancer [col=1]',
      'api: API [col=1]',
      'people -> web.app',
      'web.app -> lb',
      'lb -> api',
    ].join('\n')
    const { placed, errors } = await renderMap(flow)
    expect(errors).toEqual([])
    const byId = new Map(placed.nodes.map((n) => [n.id, n]))
    expect(byId.get('web')!.y + byId.get('web')!.h).toBeLessThanOrEqual(byId.get('lb')!.y)
    expect(byId.get('lb')!.y).toBeLessThan(byId.get('api')!.y)
  })

  test('chips of a box inside a group sit beside it, inside the frame', async () => {
    const { placed } = await renderMap(source)
    const api = placed.nodes.find((n) => n.id === 'prod.api')!
    const frame = placed.nodes.find((n) => n.id === 'prod')!
    const chips = placed.nodes.filter((n) => n.attachedTo === 'prod.api')
    expect(chips.length).toBe(2)
    for (const c of chips) {
      expect(c.x).toBeGreaterThanOrEqual(api.x + api.w)
      expect(c.x + c.w).toBeLessThanOrEqual(frame.x + frame.w)
      expect(c.y).toBeGreaterThanOrEqual(frame.y)
    }
  })
})
