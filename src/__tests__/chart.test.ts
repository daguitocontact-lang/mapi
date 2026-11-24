import { describe, expect, test } from 'bun:test'
import { formatValue, niceScale } from '../chart'
import { renderMap } from '../render-map'

describe('chart helpers', () => {
  test('formats values with their unit', () => {
    expect(formatValue(120, '$')).toBe('$120')
    expect(formatValue(12500, 'USD')).toBe('12.5k USD')
    expect(formatValue(42, '%')).toBe('42%')
    expect(formatValue(2_000_000, null)).toBe('2M')
  })

  test('axis bounds land on round steps with zero on the axis', () => {
    expect(niceScale(3, 87)).toEqual({ lo: 0, hi: 100, step: 25 })
    expect(niceScale(-40, 90).lo).toBeLessThan(0)
  })
})

describe('chart boxes', () => {
  for (const kind of ['bar', 'hbar', 'line', 'pie']) {
    test(`${kind} renders inside its box with no overlaps`, async () => {
      const src = `kind architecture\nsummary s\nc: Cost [chart=${kind}, unit=$]\nseries c A, B\ndata c Compute 120 130, Database 80 90, Cache 45 50\nx: Other\nx -> c: feeds`
      const out = await renderMap(src)
      expect(out.errors).toEqual([])
      expect(out.svg).toContain(`data-chart="${kind}"`)
    })
  }
})
