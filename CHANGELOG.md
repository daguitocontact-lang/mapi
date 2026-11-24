# Changelog

## Unreleased

### Added

- Charts: `[chart=bar|hbar|line|pie]` + `data <id> Name 120, …` (and `series <id> …` for several
  numbers per item) turn a box into a bar, horizontal bar, line or donut chart, with `[unit=…]`.
  Works in the viewer, VS Code / Kiro and the MCP renders, light and dark.
- `doc <id> <file>[#Section]`: a box's long text (a prompt, a spec) lives in its own file. The box
  gets a document mark and opens that section: in a reader beside the map (viewer) or in the
  editor at that line (VS Code / Kiro).
- `[note]`: a sticky note on the canvas that shows an excerpt of its `doc`.

## 0.1.0 — 2026-11-21

### Added

- The Mapi language, layout engine and viewer (`mapi dev`).
- MCP server (`mapi mcp`) with tools to list, read, write, validate, place and render maps,
  and the language reference as a tool and a resource.
