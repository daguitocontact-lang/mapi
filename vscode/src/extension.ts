import { basename, dirname, join, relative, sep } from 'node:path'
import * as vscode from 'vscode'
import { listLibrary, resolveMapPath } from '../../src/library'
import { renderMap } from '../../src/render-map'
import { docFor, readDocFile } from '../../src/docs'
import { parseMapi } from '../../src/parse'

type DrawRequest = { type: 'draw'; seq: number; focus: string | null }
type OpenMapRequest = { type: 'openMap'; name: string }
type OpenDocRequest = { type: 'openDoc'; id: string }
type ReadDocRequest = { type: 'readDoc'; id: string }
type ViewMessage = DrawRequest | OpenMapRequest | OpenDocRequest | ReadDocRequest

async function findMapsFolder(): Promise<string | null> {
  const workspace = vscode.workspace.workspaceFolders?.[0]
  if (!workspace) return null
  const configured = vscode.workspace.getConfiguration('mapi').get<string>('mapsFolder')
  if (configured) return join(workspace.uri.fsPath, configured)
  const found = await vscode.workspace.findFiles('**/*.mapi', '**/{node_modules,.mapi-history}/**', 500)
  if (found.length === 0) return null
  // The deepest folder holding every map, so sections (1-platform, 2-clients…) stay visible.
  const dirs = found.map((f) => dirname(f.fsPath).split(sep))
  const first = dirs[0]!
  let depth = 0
  while (depth < first.length && dirs.every((d) => d[depth] === first[depth])) depth++
  return first.slice(0, depth).join(sep) || sep
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function listHtml(root: string | null): string {
  const style = `<style>
body{padding:4px 8px;font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground)}
h3{margin:14px 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--vscode-descriptionForeground)}
button{display:block;width:100%;text-align:left;background:none;border:none;border-radius:4px;padding:5px 6px;color:inherit;font:inherit;cursor:pointer}
button:hover{background:var(--vscode-list-hoverBackground)}
small{display:block;color:var(--vscode-descriptionForeground)}
p{color:var(--vscode-descriptionForeground)}
</style>`
  if (!root) return `${style}<p>No .mapi maps in this workspace. Set <b>mapi.mapsFolder</b> to point at them.</p>`
  const sections = new Map<string, string[]>()
  for (const entry of listLibrary(root)) {
    const section = entry.section.join(' / ') || 'Maps'
    const item = `<button data-path="${escapeHtml(entry.path)}">${escapeHtml(entry.title ?? entry.name)}<small>${escapeHtml(entry.path)}</small></button>`
    sections.set(section, [...(sections.get(section) ?? []), item])
  }
  const body = [...sections].map(([name, items]) => `<h3>${escapeHtml(name)}</h3>${items.join('')}`).join('')
  return `${style}${body}<script>
const vscode = acquireVsCodeApi()
document.addEventListener('click', (e) => {
  const path = e.target.closest('button')?.dataset.path
  if (path) vscode.postMessage({ open: path })
})
</script>`
}

function viewHtml(webview: vscode.Webview, media: vscode.Uri): string {
  const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'view.css'))
  const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'view.js'))
  const csp = `default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};`
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${css}"></head>
<body><div id="app"></div><script src="${js}"></script></body></html>`
}

const isLight = () =>
  [vscode.ColorThemeKind.Light, vscode.ColorThemeKind.HighContrastLight].includes(vscode.window.activeColorTheme.kind)

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const libraryRoot = await findMapsFolder()
  const media = vscode.Uri.joinPath(context.extensionUri, 'media')
  /** The library folder when the map lives in it, so [map=…] links resolve; else its own folder. */
  const rootOf = (file: string): string =>
    libraryRoot && !relative(libraryRoot, file).startsWith('..') ? libraryRoot : dirname(file)
  const openWith = (uri: vscode.Uri, editor: string) => vscode.commands.executeCommand('vscode.openWith', uri, editor)

  const resolveMapEditor = (document: vscode.TextDocument, panel: vscode.WebviewPanel) => {
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] }
    panel.webview.html = viewHtml(panel.webview, media)
    const file = document.uri.fsPath
    panel.webview.onDidReceiveMessage(async (message: ViewMessage) => {
      if (message.type === 'openMap') {
        const root = rootOf(file)
        const target = resolveMapPath(root, message.name)
        if (target) await openWith(vscode.Uri.file(join(root, target)), 'mapi.preview')
        return
      }
      if (message.type === 'readDoc') {
        // Show the box's long text in a reader over the map, without leaving it.
        const ref = docFor(parseMapi(document.getText()).doc, message.id)
        const found = ref ? readDocFile(file, ref, rootOf(file)) : null
        await panel.webview.postMessage(
          found
            ? { type: 'doc', id: message.id, path: relative(rootOf(file), found.path), section: found.section, line: found.line, text: found.text }
            : { type: 'doc', id: message.id, error: ref ? `"${ref.path}" not found next to the map` : `no doc for "${message.id}"` },
        )
        return
      }
      if (message.type === 'openDoc') {
        // The box's long text opens beside the map, at its section.
        const ref = docFor(parseMapi(document.getText()).doc, message.id)
        const found = ref ? readDocFile(file, ref, rootOf(file)) : null
        if (!found) {
          void vscode.window.showWarningMessage(`Mapi: no document for "${message.id}"`)
          return
        }
        const text = await vscode.workspace.openTextDocument(found.path)
        const at = new vscode.Position(found.line - 1, 0)
        await vscode.window.showTextDocument(text, { viewColumn: vscode.ViewColumn.Beside, selection: new vscode.Range(at, at), preview: true })
        return
      }
      try {
        const r = await renderMap(document.getText(), {
          focus: message.focus,
          theme: isLight() ? 'light' : 'dark',
          background: false,
          readDoc: (ref) => readDocFile(file, ref, rootOf(file))?.text ?? null,
        })
        const res = { svg: r.svg, title: r.doc.title, summary: r.doc.summary, errors: r.errors, warnings: r.warnings }
        await panel.webview.postMessage({ type: 'drawn', seq: message.seq, res, fileName: basename(file, '.mapi') })
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err)
        console.error('[mapi] render failed', file, err)
        await panel.webview.postMessage({ type: 'failed', seq: message.seq, message: text })
      }
    })
    // Typing (or the file changing on disk) redraws, debounced: layout runs on every change.
    let timer: ReturnType<typeof setTimeout> | undefined
    const redraw = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void panel.webview.postMessage({ type: 'changed' }), 200)
    }
    const subscriptions = [
      vscode.workspace.onDidChangeTextDocument((e) => e.document === document && redraw()),
      vscode.window.onDidChangeActiveColorTheme(redraw),
    ]
    panel.onDidDispose(() => subscriptions.forEach((s) => s.dispose()))
  }

  let view: vscode.WebviewView | null = null
  const refresh = () => {
    if (view) view.webview.html = listHtml(libraryRoot)
  }

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'mapi.preview',
      { resolveCustomTextEditor: resolveMapEditor },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider('mapi.maps', {
      resolveWebviewView(webviewView) {
        view = webviewView
        webviewView.webview.options = { enableScripts: true }
        webviewView.webview.onDidReceiveMessage((message: { open?: string }) => {
          if (message.open && libraryRoot) openWith(vscode.Uri.file(join(libraryRoot, message.open)), 'mapi.preview')
        })
        refresh()
      },
    }),
    vscode.commands.registerCommand('mapi.showSource', (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.tabGroups.activeTabGroup.activeTab?.input
      if (target instanceof vscode.Uri) return openWith(target, 'default')
      if (target instanceof vscode.TabInputCustom) return openWith(target.uri, 'default')
    }),
    vscode.commands.registerCommand('mapi.showMap', (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (target) return openWith(target, 'mapi.preview')
    }),
  )

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.mapi')
  watcher.onDidCreate(refresh)
  watcher.onDidDelete(refresh)
  watcher.onDidChange(refresh)
  context.subscriptions.push(watcher)
}

export function deactivate(): void {}
