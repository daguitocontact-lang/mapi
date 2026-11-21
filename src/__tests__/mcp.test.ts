import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport } from '@modelcontextprotocol/server'
import { createServer } from '../mcp/server'

const EXAMPLES = join(import.meta.dir, '..', '..', 'examples')
let root: string
let client: Client

beforeAll(async () => {
  // Each run works on a copy, so write_map never touches the real examples.
  root = mkdtempSync(join(tmpdir(), 'mapi-mcp-'))
  cpSync(EXAMPLES, root, { recursive: true })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'mapi-test', version: '0.0.0' })
  await Promise.all([createServer(root).connect(serverSide), client.connect(clientSide)])
})

afterAll(async () => {
  await client.close()
  rmSync(root, { recursive: true, force: true })
})

const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args })
const textOf = (r: Awaited<ReturnType<typeof call>>) => (r.content as Array<{ text: string }>).map((c) => c.text).join('\n')

describe('tools', () => {
  test('exposes the Mapi tools, each with a description and annotations', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['get_language_reference', 'get_placement', 'list_maps', 'read_map', 'render_map', 'validate_map', 'write_map'],
    )
    for (const t of tools) {
      expect(t.description?.length ?? 0).toBeGreaterThan(40)
      expect(t.annotations).toBeDefined()
    }
  })

  test('list_maps finds the example maps', async () => {
    const r = await call('list_maps')
    expect(textOf(r)).toContain('1-demo/payments.mapi')
  })

  test('read_map returns the source; an unknown path is an error the model can act on', async () => {
    expect(textOf(await call('read_map', { path: '1-demo/payments.mapi' }))).toContain('title Payments')
    const missing = await call('read_map', { path: 'nope.mapi' })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toContain('list_maps')
  })

  test('read_map refuses paths outside the maps folder', async () => {
    const r = await call('read_map', { path: '../package.json' })
    expect(r.isError).toBe(true)
  })

  test('validate_map says ok for a clean map and reports errors for a broken one', async () => {
    expect(textOf(await call('validate_map', { path: '1-demo/payments.mapi' }))).toContain(': ok')
    const broken = await call('validate_map', { source: 'kind architecture\na: A\na -> ghost' })
    expect(textOf(broken)).toContain('unknown node "ghost"')
  })

  test('get_placement describes boxes by ruler cell and lines by route', async () => {
    const out = textOf(await call('get_placement', { path: '1-demo/payments.mapi' }))
    expect(out).toMatch(/canvas A1–/)
    expect(out).toMatch(/customer -> api "pays": [A-Z]+\d/)
  })

  test('render_map returns an SVG', async () => {
    expect(textOf(await call('render_map', { path: '1-demo/payments.mapi', theme: 'dark' }))).toStartWith('<svg')
  })

  test('write_map saves a valid map and refuses a broken one unless forced', async () => {
    const good = await call('write_map', { path: 'new/hello.mapi', source: 'kind architecture\ntitle Hello\nsummary Hi.\na: A [col=1]\nb: B [col=1]\na -> b: says hi\n' })
    expect(good.isError).toBeFalsy()
    expect(readFileSync(join(root, 'new/hello.mapi'), 'utf8')).toContain('title Hello')
    const bad = await call('write_map', { path: 'new/bad.mapi', source: 'kind architecture\na -> ghost' })
    expect(bad.isError).toBe(true)
    expect(textOf(bad)).toContain('NOT saved')
  })

  test('get_language_reference teaches the syntax', async () => {
    const ref = textOf(await call('get_language_reference'))
    expect(ref).toContain('[clone]'.slice(1, -1))
    expect(ref).toContain('at=')
  })
})
