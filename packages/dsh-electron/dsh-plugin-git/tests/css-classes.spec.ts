/**
 * Machine check that every `css.foo` / `css['foo']` reference in the client
 * source resolves to a class the imported CSS module actually exports. The
 * build rewrites class names through `lightningcss` (see
 * `tsdown.standalone.config.ts`), but tests proxy CSS modules with a permissive
 * object — so a typo or a class living in the wrong module is invisible at
 * runtime and in render specs. This spec parses the real sheets with the same
 * transform the build uses and fails on any unresolvable reference.
 *
 * Runs in the node environment: it must NOT import CSS itself, or the vitest
 * CSS-modules proxy would take part and defeat the check.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { transform } from 'lightningcss'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../src')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(entry)) out.push(path)
  }
  return out
}

/** Locally-named classes a `*.module.css` sheet exports, via the build's transform. */
function moduleClasses(file: string): Set<string> {
  const result = transform({
    filename: file,
    code: readFileSync(file),
    cssModules: { pattern: '[hash]_[local]' },
    minify: true,
  })
  return new Set(Object.keys(result.exports ?? {}))
}

const IMPORT_RE = /import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g

describe('CSS module class references', () => {
  const exportsByModule = new Map<string, Set<string>>()
  const failures: string[] = []

  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(IMPORT_RE)) {
      const binding = match[1]
      const specifier = match[2]
      if (binding === undefined || specifier === undefined) continue
      const modulePath = resolve(dirname(file), specifier)
      if (!exportsByModule.has(modulePath)) exportsByModule.set(modulePath, moduleClasses(modulePath))
      const exported = exportsByModule.get(modulePath)!
      const referenceRe = new RegExp(
        `\\b${binding}\\.([A-Za-z0-9_$]+)|\\b${binding}\\[\\s*['"]([^'"]+)['"]\\s*\\]`,
        'g',
      )
      for (const ref of source.matchAll(referenceRe)) {
        const name = ref[1] ?? ref[2]
        if (name === undefined) continue
        if (exported.has(name)) continue
        const line = source.slice(0, ref.index).split('\n').length
        failures.push(`${file}:${line} references .${name} missing from ${specifier}`)
      }
    }
  }

  it('resolves every referenced class against its CSS module', () => {
    expect(failures).toEqual([])
  })

  it('actually inspects the source tree', () => {
    // Guard against the check silently checking nothing (renamed directories,
    // changed import styles): the known-good sample must be in scope.
    expect(exportsByModule.size).toBeGreaterThan(0)
    expect([...exportsByModule.keys()].some(module => module.endsWith('GitDetailsSurface.module.css'))).toBe(true)
  })
})
