// Exercise the actual DSH dispatcher with a non-loopback target so its mandatory bypass cannot mask Gateway routing.
import { installProxyFromEnvironment } from '../../../../packages/util/http-proxy/src/index.ts'

const dispose = await installProxyFromEnvironment({
  get(name) {
    const value = process.env[name]
    return value === undefined ? undefined : { value }
  },
}, () => { throw new Error('Unexpected proxy policy diagnostic') })
try {
  const response = await fetch('http://remote-only.invalid/health', { signal: AbortSignal.timeout(10_000) })
  if (response.status !== 401 || await response.text() !== 'fixture') throw new Error('Unexpected origin response')
  process.stdout.write('DSH Gateway transport reachable\n')
} finally {
  await dispose()
}
