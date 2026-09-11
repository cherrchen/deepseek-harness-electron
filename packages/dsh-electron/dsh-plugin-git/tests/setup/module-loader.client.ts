import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import type { ReactNode } from 'react'

const nodeRequire = createRequire(import.meta.url)

type Factory = (require: NodeJS.Require) => Record<string, unknown>

type ModuleLoader = {
  load(handoff: { id: string; factory: Factory }): void
}

const factories = new Map<string, Factory>()
const materialized = new Map<string, Record<string, unknown>>()

function loaderHost(): { __ModuleLoader__?: ModuleLoader } {
  return globalThis as { __ModuleLoader__?: ModuleLoader }
}

// The details-host client bundle treats the host-injected primitives package
// as an external. The real ModuleLoader injects the host's copy at runtime;
// at test time Node cannot evaluate that package's CSS modules, so the
// loader hands the bundle a host-side stand-in with the same contract.
// Plugin code that imports primitives directly keeps going through Vite and
// the real implementations.
function TooltipStub({ children }: { children: ReactNode }): ReactNode {
  return children
}

materialized.set('@deepseek-ai/dsh-client-ui-primitives', { Tooltip: TooltipStub })

function bundleRequire(specifier: string): unknown {
  if (materialized.has(specifier)) return materialized.get(specifier)
  return nodeRequire(specifier)
}

loaderHost().__ModuleLoader__ = {
  load({ id, factory }: { id: string; factory: Factory }) {
    if (!materialized.has(id)) materialized.set(id, factory(bundleRequire as NodeJS.Require))
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
  // This fixture intentionally evaluates the built client bundle through its browser loader protocol.
  // oxlint-disable-next-line typescript/no-implied-eval
  const evaluate = new Function('window', 'globalThis', `${source}\n;return null;`)
  // oxlint-disable-next-line typescript/no-unsafe-call -- typed immediately above
  evaluate(host, globalThis)
  const factory = factories.get(packageName)
  if (factory === undefined) throw new Error(`client bundle ${packageName} did not register via __ModuleLoader__.load`)
  const exports = factory(bundleRequire as NodeJS.Require)
  materialized.set(packageName, exports)
  return exports
}
