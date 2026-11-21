<h1 align="center">Mapi</h1>

<p align="center">
  <strong>One text language to map business, infrastructure and code.</strong><br>
  A person or an AI writes a <code>.mapi</code> file; Mapi draws it — and tells the AI where everything landed.
</p>

---

## What it is

Diagrams drift because nobody can read them back. Mapi keeps a map as **plain text** that
lives next to the code, and draws it for humans:

1. **A tiny language** — boxes, groups, lines with an action, and a handful of attributes.
2. **A layout engine** — nothing is ever drawn on top of anything (boxes, lines, labels,
   titles), columns stay where you put them, lines take the fewest turns.
3. **Eyes for the AI** — every render returns a short **placement text**: the ruler cell of
   each box and the route of each line (`G1↓G4←F4`, length, bends, crossings), so an assistant
   can find and fix a confusing spot without looking at an image.

> "Write what the system is. Mapi works out where everything goes."

## Quick start

```bash
pnpm install
pnpm dev                      # viewer on http://localhost:4080 (live reload, version history)
bun src/cli.ts dev ./my-maps  # view any folder of .mapi files
pnpm test                     # every example: zero overlaps at every level
```

## A map in 10 lines

```mapi
kind architecture
title Payments
summary The customer pays in the store; the API charges the card and saves the order.

customer: Customer [actor, top]
api: Payments API [icon=aws-ecs]
db: Database [store, clone]
stripe: Stripe [external, icon=stripe]

customer -> api: pays
api -> stripe: charges
api -> db: saves the order
about api Takes the payment, charges it and saves the order.
```

More in [`examples/`](./examples) — a payments demo and a copy of a public cloud reference
architecture drawn with exact placement and cloud icons.

## Stack

- **Language & engine**: TypeScript, own grid placer + orthogonal router, ELK for flows
- **Rendering**: SVG — `clean` (minimal) and `sketch` (hand-drawn, rough.js)
- **Icons**: Iconify `logos` (brands, cloud services) and `lucide` (generic glyphs), offline
- **Viewer**: single-page dev server with live reload, drill-in, history and drag-to-move
- **Tooling**: Bun (dev, tests) · tsup (build) · pnpm

## Structure

```
src/
  parse.ts        .mapi → document (attributes, about, steps)
  focus.ts        levels, drill-in, essentials vs context
  clones.ts       [clone] reference chips
  layout/         grid placer, router, ELK build, overlap inspector
  render/         SVG, shapes, themes
  describe.ts     the placement text for AI
  dev-server.ts   viewer server (live reload, history, move)
  viewer-page.ts  the viewer UI
  cli.ts          `mapi dev <folder>`
  __tests__/      maps + language rules
examples/         generic sample maps
```

## The language

### Header

| Line | Meaning |
|---|---|
| `kind flow` / `kind architecture` | A numbered story (flow) or a map of pieces (architecture). |
| `title …` / `summary …` | Name and the one idea a reader must get first. |
| `layers A, B, C` + `layer A` | Optional bands (flows). Architecture maps usually skip them. |
| `about <id> <text>` | Plain-language "what is this piece", shown in the side panel. |

### Boxes — `id: Label\nsecond line [attributes]`

| Attribute | Meaning |
|---|---|
| `actor` `store` `external` `decision` `icon` | Shape: person, data, third party, diamond, big logo over its name. |
| `dashed` `text` | Optional/failure box; a note (explains the box next to it). |
| `icon=aws-lambda` / `icon=lucide:users` | Logo (Iconify `logos`) or line glyph (`lucide:` prefix). On a group: left of its title. |
| `col=2` / `col=1.85` | Column (architecture). Fractions sit between columns; the number counts. |
| `row=services` | Every box with the same row name sits at the same height. |
| `top` / `bottom` | Pin to the first row (entries — nothing else shares it) or the last (asides). |
| `lane=Name` | Dashed frame around every box that shares it, across rows. |
| `clone` | Shared piece (database, queue…): drawn as a small chip beside each box that uses it, no long lines. Stores on the left, services on the right, same order everywhere. |
| `same=alb` | The same real resource drawn twice (one load balancer, two routes): lit together, aligned. |
| `at=B3` / `at=4.3/2` / `at=2.5/0.7:9/3.8` | Exact placement: ruler cell, exact point, or a group's frame. Use it to copy a diagram as is. |
| `color=purple` | Outline colour: `purple` `pink` `orange` `green` `blue` `gray` `red` (cloud-diagram frames). |
| `badge=4` | Numbered blue marker in the corner, like a reference diagram's callouts. |
| `collapsed` | Group drawn as a stacked card; double-click to open it. |
| `map=other` | Opens another map (another world). |
| `code=path:line` | Where it lives in the code; the viewer opens it, the validator flags it when stale. |
| `always` | Stays visible in the essentials view. |

Groups: `id: Title [attrs] { … }`. A line can start from a box inside a group (`app.c -> mf`).

### Lines — `[step] from -> to: action`

| Form | Meaning |
|---|---|
| `a -> b: label` | Solid line with an action. |
| `a --> b: label` | Dashed: optional, failure, or **planned but not deployed**. |
| `a <-> b` | Both ways. |
| `1 a -> b`, `2a`, `3.1` | Story steps (flows): `2a/2b` alternatives, `3.1` context sub-steps. |

A line that closes a loop back toward the entries is detected as a **return** and never pushes
boxes down.

## How layout works

- **Architecture with `col=`** — Mapi's grid: exact columns, depth by line flow, columns pack
  sideways, entries slide to drop their lines straight, own orthogonal router (fewest turns,
  no shared tracks, tries several orders to avoid crossings).
- **`at=` anywhere** — free placement: every box where the author put it; Mapi only routes.
- **Flows** — ELK layered layout with step badges.

Hard rule everywhere: nothing is drawn on top of anything (boxes, lines, labels, titles).
The tests in `src/__tests__/` enforce it for every map in `examples/`.

## License

MIT © Daguito, LLC
