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

describe('charts', () => {
  const chartOf = (src: string) => parseMapi(`kind architecture\n${src}\n`)

  test('a box with [chart=…] draws its data line', () => {
    const { doc, errors } = chartOf('cost: AWS [chart=hbar, unit=USD]\ndata cost Fargate 120, RDS: 80, Valkey 1.5k')
    expect(errors.filter((e) => e.level !== 'warning')).toEqual([])
    expect(doc.nodes[0]!.chart).toEqual({
      kind: 'hbar',
      unit: 'USD',
      series: [],
      points: [
        { label: 'Fargate', values: [120] },
        { label: 'RDS', values: [80] },
        { label: 'Valkey', values: [1500] },
      ],
    })
  })

  test('data alone draws bars; series names several values per item', () => {
    const { doc } = chartOf('g: Growth\nseries g 2025, 2026\ndata g Jan 1 2, Feb 3 4')
    const chart = doc.nodes[0]!.chart!
    expect(chart.kind).toBe('bar')
    expect(chart.series).toEqual(['2025', '2026'])
    expect(chart.points[1]).toEqual({ label: 'Feb', values: [3, 4] })
    expect(doc.nodes[0]!.always).toBe(true)
  })

  test('bad numbers, unknown boxes and missing data are reported', () => {
    expect(chartOf('a: A\ndata a Fargate').errors.map((e) => e.message)).toContain('data a: "Fargate" needs a name and a number ("Fargate 120")')
    expect(chartOf('a: A\ndata b X 1').errors.map((e) => e.message)).toContain('data references unknown box "b"')
    expect(chartOf('a: A [chart=pie]').errors.some((e) => e.level === 'warning' && e.message.includes('has no "data a'))).toBe(true)
  })

  test('"data -> x" is still a line from a box called data', () => {
    const { doc } = chartOf('data: Data\nx: X\ndata -> x: sends')
    expect(doc.edges).toHaveLength(1)
    expect(doc.charts).toEqual({})
  })
})
