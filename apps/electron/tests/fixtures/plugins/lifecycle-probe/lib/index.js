import { appendFileSync } from 'node:fs'

function write(marker) {
  const target = process.env.DSH_ELECTRON_LIFECYCLE_PROBE_LOG
  if (typeof target !== 'string' || target.length === 0) return
  appendFileSync(target, `${marker}\n`, 'utf8')
}

export function apply(ctx) {
  write('APPLY')
  ctx.effect(() => () => {
    write('DISPOSE')
  }, 'lifecycle-probe: log')
}
