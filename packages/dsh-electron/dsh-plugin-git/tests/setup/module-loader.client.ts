import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const nodeRequire = createRequire(import.meta.url)

type Factory = (require: NodeRequire) => Record<string, unknown>

type ModuleLoader = {
  load(handoff: { id: string; factory: Factory }): void
}

const factories = new Map<string, Factory>()
const materialized = new Map<string, Record<string, unknown>>()

function loaderHost(): { __ModuleLoader__?: ModuleLoader } {
  return globalThis as { __ModuleLoader__?: ModuleLoader }
}

function bundleRequire(specifier: string): unknown {
  if (materialized.has(specifier)) return materialized.get(specifier)
  return nodeRequire(specifier)
}

loaderHost().__ModuleLoader__ = {
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
  const host = loaderHost()
  const evaluate = new Function('window', 'globalThis', `${source}\n;return null;`)
  evaluate(host, globalThis)
  const factory = factories.get(packageName)
  if (factory === undefined) throw new Error(`client bundle ${packageName} did not register via __ModuleLoader__.load`)
  const exports = factory(bundleRequire as NodeRequire)
  materialized.set(packageName, exports)
  return exports
}
