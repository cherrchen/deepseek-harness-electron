import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const nodeRequire = createRequire(import.meta.url)

type Factory = (require: NodeRequire) => Record<string, unknown>

const factories = new Map<string, Factory>()
const materialized = new Map<string, Record<string, unknown>>()

function ensureWindow(): Window & typeof globalThis {
  const root = globalThis as typeof globalThis & { window?: Window }
  if (root.window === undefined) root.window = root as unknown as Window
  return root.window
}

function bundleRequire(specifier: string): unknown {
  if (materialized.has(specifier)) return materialized.get(specifier)
  return nodeRequire(specifier)
}

ensureWindow().__ModuleLoader__ = {
  load({ id, factory }: { id: string; factory: Factory }) {
    if (!materialized.has(id)) materialized.set(id, factory(bundleRequire as NodeRequire))
    factories.set(id, factory)
  },
}

/** Materialize one published client bundle through the DSH `__ModuleLoader__` protocol. */
export function materializeClientBundle(packageName: string): Record<string, unknown> {
  const cached = materialized.get(packageName)
  if (cached !== undefined) return cached
  const entry = nodeRequire.resolve(`${packageName}/client`)
  const source = readFileSync(entry, 'utf8')
  const evaluate = new Function('window', 'globalThis', `${source}\n;return null;`)
  evaluate(ensureWindow(), globalThis)
  const factory = factories.get(packageName)
  if (factory === undefined) throw new Error(`client bundle ${packageName} did not register via __ModuleLoader__.load`)
  const exports = factory(bundleRequire as NodeRequire)
  materialized.set(packageName, exports)
  return exports
}
