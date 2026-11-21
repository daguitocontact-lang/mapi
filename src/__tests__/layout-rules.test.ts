import { describe, expect, test } from 'bun:test'
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
