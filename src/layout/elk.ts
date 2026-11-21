import { createRequire } from 'node:module'
import ELK from 'elkjs/lib/elk-api.js'
import type { ElkNode, ELKConstructorArguments } from 'elkjs/lib/elk-api.js'

type ElkWorker = ReturnType<NonNullable<ELKConstructorArguments['workerFactory']>>
type InProcessWorkerCtor = new (url?: string) => ElkWorker

// elk-worker treats "`self` defined, no `document`" as running inside a Web
// Worker and skips its CommonJS export — Bun and Deno define `self`. Hide it for
// the duration of the require so the in-process worker is exported everywhere.
function loadInProcessWorker(): InProcessWorkerCtor {
  const scope = globalThis as { self?: unknown }
  const saved = scope.self
  delete scope.self
  try {
    const mod = createRequire(import.meta.url)('elkjs/lib/elk-worker.min.js') as {
      Worker?: InProcessWorkerCtor
    }
    if (!mod.Worker) throw new Error('elkjs in-process worker did not export')
    return mod.Worker
  } finally {
    if (saved !== undefined) scope.self = saved
  }
}

const InProcessWorker = loadInProcessWorker()
const elk = new ELK({ workerFactory: (url) => new InProcessWorker(url) })

export function runElk(graph: ElkNode): Promise<ElkNode> {
  return elk.layout(graph)
}
