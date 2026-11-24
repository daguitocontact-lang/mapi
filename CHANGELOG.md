# Changelog

## Unreleased

### Added

- `doc <id> <file>[#Section]`: a box's long text (a prompt, a spec) lives in its own file. The box
  gets a document mark and opens that section: in a reader beside the map (viewer) or in the
  editor at that line (VS Code / Kiro).
- `[note]`: a sticky note on the canvas that shows an excerpt of its `doc`.

## 0.1.0 — 2026-11-21

### Added

- The Mapi language, layout engine and viewer (`mapi dev`).
- MCP server (`mapi mcp`) with tools to list, read, write, validate, place and render maps,
  and the language reference as a tool and a resource.
