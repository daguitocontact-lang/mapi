import { describe, expect, test } from 'bun:test'
import { parseMapi } from '../parse'

const one = (line: string) => parseMapi(`kind architecture\n${line}\n`).doc.nodes[0]!

describe('node attributes', () => {
  test('reads fractional columns and named rows', () => {
    const n = one('worker: Worker [col=1.85, row=services]')
    expect(n.col).toBe(1.85)
    expect(n.row).toBe('services')
  })

  test('reads [same=], [top] and [bottom]', () => {
    expect(one('a: A [same=alb]').cloneOf).toBe('alb')
    expect(one('a: A [top]').pin).toBe('top')
    expect(one('a: A [bottom]').pin).toBe('bottom')
  })

  test('reads exact placement by point, range and ruler cell', () => {
    expect(one('a: A [at=4.3/2]').at).toBe('4.3/2')
    expect(one('a: A [at=2.5/0.7:9/3.8]').at).toBe('2.5/0.7:9/3.8')
    expect(one('a: A [at=B3]').at).toBe('B3')
  })

  test('reads icons from another set and the icon shape', () => {
    const n = one('u: Users [icon, icon=lucide:users]')
    expect(n.shape).toBe('icon')
    expect(n.icon).toBe('lucide:users')
  })

  test('reads a named outline colour and a corner badge', () => {
    const n = one('vpc: VPC [color=purple, badge=9]')
    expect(n.color).toBe('purple')
    expect(n.badge).toBe('9')
    expect(one('x: X [color=fuchsia]').color).toBeNull()
  })

  test('marks shared boxes with [clone]', () => {
    expect(one('vk: Cache [store, clone]').clone).toBe(true)
  })
})

describe('descriptions', () => {
  test('keeps "about" text per box id', () => {
    const { doc } = parseMapi('kind architecture\nabout api Receives the requests.\napi: API\n')
    expect(doc.about.api).toBe('Receives the requests.')
  })
})
