import type { Box } from '../layout'
import type { NodeShape } from '../model'

const STORE_CAP = 8

export function roundedRectPath({ x, y, w, h }: Box, r: number): string {
  const rr = Math.min(r, w / 2, h / 2)
  return [
    `M${x + rr},${y}`, `H${x + w - rr}`, `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h - rr}`, `Q${x + w},${y + h} ${x + w - rr},${y + h}`,
    `H${x + rr}`, `Q${x},${y + h} ${x},${y + h - rr}`, `V${y + rr}`, `Q${x},${y} ${x + rr},${y}`, 'Z',
  ].join(' ')
}

/** Data store: a plain box — its logo and name say it stores data (no cylinder, no marks). */
function storePath(box: Box, radius: number): string {
  return roundedRectPath(box, radius)
}

const EXTERNAL_INSET = 4

/** Outside service: a box with a double border (outer + inset outline). */
function externalPath(box: Box, radius: number): string {
  const inner = { x: box.x + EXTERNAL_INSET, y: box.y + EXTERNAL_INSET, w: box.w - EXTERNAL_INSET * 2, h: box.h - EXTERNAL_INSET * 2 }
  return `${roundedRectPath(box, radius)} ${roundedRectPath(inner, Math.max(2, radius - EXTERNAL_INSET))}`
}

/** Diamond: a decision. Edges leave from its vertices (the box side midpoints). */
function decisionPath({ x, y, w, h }: Box): string {
  return `M${x + w / 2},${y} L${x + w},${y + h / 2} L${x + w / 2},${y + h} L${x},${y + h / 2} Z`
}

export function shapePath(shape: NodeShape, box: Box, radius: number): string {
  switch (shape) {
    case 'step':
      return roundedRectPath(box, radius)
    case 'actor':
      return roundedRectPath(box, box.h / 2)
    case 'store':
      return storePath(box, Math.min(radius, 8))
    case 'external':
      return externalPath(box, radius)
    case 'decision':
      return decisionPath(box)
    case 'icon':
      // Cloud-diagram style: the logo IS the shape — no outline.
      return ''
    default: {
      const unreachable: never = shape
      throw new Error(`unknown shape ${String(unreachable)}`)
    }
  }
}

/** Where the label sits vertically — a cylinder's text centres below its top cap. */
export function labelOffsetY(shape: NodeShape): number {
  return 0
}
