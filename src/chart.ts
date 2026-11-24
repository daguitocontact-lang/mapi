import { textWidth } from './measure'

/**
 * Charts: a box that draws numbers instead of a label.
 *   cost: AWS per month [chart=bar, unit=USD]
 *   data cost Fargate 120, RDS 80, Valkey 45
 *   series cost 2025, 2026            (optional: several values per item → grouped bars / lines)
 * Pure (no node:fs) — the parser and the renderer also run in browsers.
 */
export const CHART_KINDS = ['bar', 'hbar', 'line', 'pie'] as const
export type ChartKind = (typeof CHART_KINDS)[number]

export type ChartPoint = { label: string; values: number[] }

export type ChartSpec = {
  kind: ChartKind
  /** `$` `€` `£` go before the number; anything else after it (`%`, `ms`, `USD`). */
  unit: string | null
  /** Names of the series, in order (empty = one unnamed series). */
  series: string[]
  points: ChartPoint[]
}

const NUMBER = /^-?\d+(?:\.\d+)?[kKmM]?$/

function toNumber(raw: string): number {
  const scale = /[kK]$/.test(raw) ? 1e3 : /[mM]$/.test(raw) ? 1e6 : 1
  return Number(raw.replace(/[kKmM]$/, '')) * scale
}

/** `Fargate 120, RDS: 80, Valkey 45 50` → points; the numbers are the trailing words of each item. */
export function parseChartData(raw: string): { points: ChartPoint[]; error: string | null } {
  const points: ChartPoint[] = []
  for (const item of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const words = item.split(/\s+/)
    const values: number[] = []
    while (words.length > 1 && NUMBER.test(words[words.length - 1]!)) values.unshift(toNumber(words.pop()!))
    const label = words.join(' ').replace(/:$/, '').trim()
    if (!label || values.length === 0) return { points, error: `"${item}" needs a name and a number ("Fargate 120")` }
    points.push({ label, values })
  }
  if (points.length === 0) return { points, error: 'data needs at least one "name number" item' }
  return { points, error: null }
}

/** How many series a chart draws: the most values any item carries, at least the named series. */
export function seriesCount(spec: ChartSpec): number {
  return Math.max(spec.series.length, ...spec.points.map((p) => p.values.length), 1)
}

/** 1234 → "1.2k", 12.5 → "12.5", with the unit in its place. */
export function formatValue(v: number, unit: string | null): string {
  const a = Math.abs(v)
  const round = (n: number) => String(Math.round(n * 10) / 10)
  const num = a >= 1e6 ? `${round(v / 1e6)}M` : a >= 1e4 ? `${round(v / 1e3)}k` : round(v)
  if (!unit) return num
  if (/^[$€£¥]$/.test(unit)) return v < 0 ? `-${unit}${num.slice(1)}` : `${unit}${num}`
  return unit === '%' ? `${num}%` : `${num} ${unit}`
}

/** Axis bounds rounded to 1 / 2 / 5 steps, with zero always on the axis. */
export function niceScale(min: number, max: number, ticks = 4): { lo: number; hi: number; step: number } {
  const lo0 = Math.min(0, min)
  const hi0 = Math.max(0, max)
  const span = hi0 - lo0 || 1
  const raw = span / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  return { lo: Math.floor(lo0 / step) * step, hi: Math.ceil(hi0 / step) * step || step, step }
}

// ---- Size: the layout reserves exactly what the renderer draws. --------------------------

export const CHART_TITLE_SIZE = 14
export const CHART_TEXT = 11
const PAD = 16
const PLOT_H = 150
const AXIS_W = 44
const BAR_W = 18
const LEGEND_H = 24
const HBAR_ROW = 22
const HBAR_MAX = 200
const PIE_D = 132
const LEGEND_ROW = 20
const SWATCH = 10

function titleHeight(label: string): number {
  return label.split('\n').length * CHART_TITLE_SIZE * 1.35 + 14
}

function titleWidth(label: string): number {
  return Math.max(...label.split('\n').map((l) => textWidth(l, CHART_TITLE_SIZE)))
}

function legendWidth(spec: ChartSpec): number {
  return spec.series.reduce((w, s) => w + SWATCH + 6 + textWidth(s, CHART_TEXT) + 16, 0)
}

/** Width of one category slot on a vertical chart: room for its name and its bars. */
function slotWidth(spec: ChartSpec): number {
  const n = seriesCount(spec)
  const name = Math.max(...spec.points.map((p) => textWidth(p.label, CHART_TEXT)))
  const value = Math.max(...spec.points.flatMap((p) => p.values.map((v) => textWidth(formatValue(v, spec.unit), CHART_TEXT - 1))))
  const bars = spec.kind === 'line' ? 0 : n * BAR_W + (n - 1) * 3
  return Math.max(name + 12, bars + 18, n === 1 ? value + 10 : 0, 40)
}

function pieLegendWidth(spec: ChartSpec): number {
  return Math.max(...spec.points.map((p) => SWATCH + 8 + textWidth(`${p.label}  ${formatValue(p.values[0]!, spec.unit)} · 100%`, CHART_TEXT) + 8))
}

function hbarLabelWidth(spec: ChartSpec): number {
  return Math.max(...spec.points.map((p) => textWidth(p.label, CHART_TEXT))) + 12
}

function hbarRow(spec: ChartSpec): number {
  return seriesCount(spec) * (HBAR_ROW - 6) + 10
}

export function chartSize(spec: ChartSpec, label: string): { width: number; height: number } {
  const head = titleHeight(label)
  const legend = spec.series.length > 1 && spec.kind !== 'pie' ? LEGEND_H : 0
  const minW = Math.max(titleWidth(label), legend ? legendWidth(spec) : 0) + PAD * 2
  if (spec.kind === 'pie') {
    const body = Math.max(PIE_D, spec.points.length * LEGEND_ROW)
    return { width: Math.max(minW, PAD + PIE_D + 24 + pieLegendWidth(spec) + PAD), height: head + body + PAD + 8 }
  }
  if (spec.kind === 'hbar') {
    const value = Math.max(...spec.points.flatMap((p) => p.values.map((v) => textWidth(formatValue(v, spec.unit), CHART_TEXT))))
    const width = PAD + hbarLabelWidth(spec) + HBAR_MAX + 8 + value + PAD
    return { width: Math.max(minW, width), height: head + legend + spec.points.length * hbarRow(spec) + PAD }
  }
  const width = PAD + AXIS_W + spec.points.length * slotWidth(spec) + PAD
  return { width: Math.max(minW, width, 240), height: head + legend + 18 + PLOT_H + 26 + PAD }
}

// ---- Drawing ---------------------------------------------------------------------------

export type ChartColors = { text: string; muted: string; grid: string; surface: string; series: string[]; font: string }

type Box = { x: number; y: number; w: number; h: number }

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function text(x: number, y: number, s: string, c: ChartColors, o: { size?: number; anchor?: string; color?: string; weight?: number } = {}): string {
  const w = o.weight ? ` font-weight="${o.weight}"` : ''
  return `<text x="${x}" y="${y}" font-size="${o.size ?? CHART_TEXT}" fill="${o.color ?? c.muted}"${w} text-anchor="${o.anchor ?? 'start'}" dominant-baseline="middle">${esc(s)}</text>`
}

const r1 = (n: number) => Math.round(n * 10) / 10

function legend(spec: ChartSpec, c: ChartColors, x: number, y: number): string {
  let out = ''
  let at = x
  spec.series.forEach((name, i) => {
    out += `<rect x="${at}" y="${y - SWATCH / 2}" width="${SWATCH}" height="${SWATCH}" rx="2" fill="${c.series[i % c.series.length]}"/>`
    out += text(at + SWATCH + 6, y, name, c)
    at += SWATCH + 6 + textWidth(name, CHART_TEXT) + 16
  })
  return out
}

function drawVertical(spec: ChartSpec, c: ChartColors, area: Box): string {
  const n = seriesCount(spec)
  const all = spec.points.flatMap((p) => p.values)
  const { lo, hi, step } = niceScale(Math.min(...all), Math.max(...all))
  const plotX = area.x + AXIS_W
  const plotW = area.w - AXIS_W
  const top = area.y + 18
  const bottom = top + PLOT_H
  const yOf = (v: number) => r1(bottom - ((v - lo) / (hi - lo)) * PLOT_H)
  let out = ''
  for (let v = lo; v <= hi + step / 2; v += step) {
    const y = yOf(v)
    out += `<line x1="${plotX}" y1="${y}" x2="${plotX + plotW}" y2="${y}" stroke="${c.grid}" stroke-width="1"${v === 0 ? '' : ' stroke-dasharray="3 4"'}/>`
    out += text(plotX - 8, y, formatValue(v, spec.unit), c, { anchor: 'end', size: CHART_TEXT - 1 })
  }
  const slot = plotW / spec.points.length
  const zero = yOf(0)
  if (spec.kind === 'line') {
    for (let s = 0; s < n; s++) {
      const pts = spec.points.flatMap((p, i) => (p.values[s] === undefined ? [] : [[r1(plotX + slot * (i + 0.5)), yOf(p.values[s]!)] as const]))
      const color = c.series[s % c.series.length]
      out += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`
      out += pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${c.surface}" stroke="${color}" stroke-width="2"/>`).join('')
      if (n === 1) out += spec.points.map((p, i) => text(pts[i]![0], pts[i]![1] - 12, formatValue(p.values[0]!, spec.unit), c, { anchor: 'middle', size: CHART_TEXT - 1, color: c.text })).join('')
    }
  } else {
    const group = n * BAR_W + (n - 1) * 3
    spec.points.forEach((p, i) => {
      const left = plotX + slot * i + (slot - group) / 2
      p.values.forEach((v, s) => {
        const x = r1(left + s * (BAR_W + 3))
        const y = Math.min(yOf(v), zero)
        const h = Math.max(1, Math.abs(yOf(v) - zero))
        const fill = c.series[(n === 1 ? 0 : s) % c.series.length]
        out += `<rect x="${x}" y="${y}" width="${BAR_W}" height="${r1(h)}" rx="3" fill="${fill}"><title>${esc(`${p.label}${spec.series[s] ? ` · ${spec.series[s]}` : ''}: ${formatValue(v, spec.unit)}`)}</title></rect>`
      })
      if (n === 1) {
        const v = p.values[0]!
        const y = v >= 0 ? yOf(v) - 9 : yOf(v) + 9
        out += text(r1(plotX + slot * (i + 0.5)), y, formatValue(v, spec.unit), c, { anchor: 'middle', size: CHART_TEXT - 1, color: c.text })
      }
    })
  }
  spec.points.forEach((p, i) => {
    out += text(r1(plotX + slot * (i + 0.5)), bottom + 16, p.label, c, { anchor: 'middle' })
  })
  return out
}

function drawHorizontal(spec: ChartSpec, c: ChartColors, area: Box): string {
  const n = seriesCount(spec)
  const max = Math.max(...spec.points.flatMap((p) => p.values), 0) || 1
  const labelW = hbarLabelWidth(spec)
  const row = hbarRow(spec)
  const barH = HBAR_ROW - 8
  let out = ''
  spec.points.forEach((p, i) => {
    const y0 = area.y + i * row
    out += text(area.x + labelW - 10, y0 + row / 2, p.label, c, { anchor: 'end', color: c.text })
    p.values.forEach((v, s) => {
      const y = r1(y0 + 5 + s * (HBAR_ROW - 6))
      const w = r1(Math.max(1, (Math.max(0, v) / max) * HBAR_MAX))
      const fill = c.series[(n === 1 ? 0 : s) % c.series.length]
      out += `<rect x="${area.x + labelW}" y="${y}" width="${w}" height="${barH}" rx="3" fill="${fill}"/>`
      out += text(area.x + labelW + w + 6, y + barH / 2, formatValue(v, spec.unit), c, { size: CHART_TEXT - 1, color: c.text })
    })
  })
  return out
}

function drawPie(spec: ChartSpec, c: ChartColors, area: Box): string {
  const values = spec.points.map((p) => Math.max(0, p.values[0]!))
  const total = values.reduce((a, b) => a + b, 0) || 1
  const r = PIE_D / 2
  const cx = area.x + r
  const cy = area.y + Math.max(PIE_D, spec.points.length * LEGEND_ROW) / 2
  const hole = r * 0.58
  let out = ''
  let angle = -Math.PI / 2
  values.forEach((v, i) => {
    const color = c.series[i % c.series.length]
    const sweep = (v / total) * Math.PI * 2
    if (v <= 0) return
    if (sweep >= Math.PI * 2 - 1e-6) {
      out += `<circle cx="${cx}" cy="${cy}" r="${(r + hole) / 2}" fill="none" stroke="${color}" stroke-width="${r - hole}"/>`
      angle += sweep
      return
    }
    const p = (a: number, rr: number) => `${r1(cx + rr * Math.cos(a))},${r1(cy + rr * Math.sin(a))}`
    const large = sweep > Math.PI ? 1 : 0
    const end = angle + sweep
    out += `<path d="M${p(angle, r)} A${r},${r} 0 ${large} 1 ${p(end, r)} L${p(end, hole)} A${hole},${hole} 0 ${large} 0 ${p(angle, hole)} Z" fill="${color}" stroke="${c.surface}" stroke-width="2"><title>${esc(`${spec.points[i]!.label}: ${formatValue(v, spec.unit)}`)}</title></path>`
    angle = end
  })
  out += text(cx, cy, formatValue(total, spec.unit), c, { anchor: 'middle', size: 13, color: c.text, weight: 600 })
  const lx = cx + r + 24
  const ly = cy - (spec.points.length * LEGEND_ROW) / 2 + LEGEND_ROW / 2
  spec.points.forEach((pt, i) => {
    const y = ly + i * LEGEND_ROW
    const pct = Math.round((values[i]! / total) * 100)
    out += `<rect x="${lx}" y="${y - SWATCH / 2}" width="${SWATCH}" height="${SWATCH}" rx="2" fill="${c.series[i % c.series.length]}"/>`
    out += text(lx + SWATCH + 8, y, pt.label, c, { color: c.text })
    out += text(lx + SWATCH + 8 + textWidth(`${pt.label}  `, CHART_TEXT), y, `${formatValue(values[i]!, spec.unit)} · ${pct}%`, c)
  })
  return out
}

/** Title + chart inside the box the layout reserved (the card itself is drawn by the caller). */
export function drawChart(spec: ChartSpec, label: string, box: Box, c: ChartColors): string {
  const lines = label.split('\n')
  let out = lines
    .map((l, i) => text(box.x + PAD, box.y + PAD + 4 + i * CHART_TITLE_SIZE * 1.35, l, c, { size: CHART_TITLE_SIZE, color: c.text, weight: 600 }))
    .join('')
  let y = box.y + titleHeight(label)
  if (spec.series.length > 1 && spec.kind !== 'pie') {
    out += legend(spec, c, box.x + PAD, y + 6)
    y += LEGEND_H
  }
  const area = { x: box.x + PAD, y, w: box.w - PAD * 2, h: box.y + box.h - PAD - y }
  if (spec.kind === 'pie') return out + drawPie(spec, c, area)
  if (spec.kind === 'hbar') return out + drawHorizontal(spec, c, area)
  return out + drawVertical(spec, c, area)
}
