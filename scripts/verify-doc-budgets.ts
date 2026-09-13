/**
 * Enforce `wc -w`-style ceilings from `scripts/doc-budgets.manifest.json`.
 * Missing files and invalid ceilings fail; `--list` reports current usage.
 * Only listed standing docs are budgeted. Ceilings ratchet down with at least
 * 5% headroom; raising one requires the justification defined in
 * `docs/AGENTS.md`. This Desktop fork skips root `AGENTS.md` because upstream
 * owns that file (`AGENTS.downstream.md`).
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const MANIFEST_PATH = resolve(root, 'scripts/doc-budgets.manifest.json')

/**
 * Standing docs this fork cannot edit to satisfy a local ceiling. Keep the
 * upstream manifest entry so sync does not fight the skip.
 */
export const DOWNSTREAM_DOC_BUDGET_EXCLUSIONS: ReadonlySet<string> = new Set(['AGENTS.md'])

/** Existence and word-count probes for one budget evaluation. */
export interface DocBudgetObservation {
  readonly exists: (path: string) => boolean
  readonly words: (path: string) => number
}

/** `--list` rows plus failure messages for one budget evaluation. */
export interface DocBudgetReport {
  readonly failures: readonly string[]
  readonly rows: readonly string[]
}

/** `wc -w` equivalent: count whitespace-delimited tokens. */
export function countDocBudgetWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Compare one budget manifest against observed files.
 * @param manifest - path to positive integer ceiling, from the upstream list.
 * @param observation - existence and word-count probes for each path.
 * @param exclusions - paths to skip; defaults to {@link DOWNSTREAM_DOC_BUDGET_EXCLUSIONS}.
 * @returns `--list` rows and failure messages (empty when every remaining path is in budget).
 */
export function evaluateDocBudgets(
  manifest: Readonly<Record<string, number>>,
  observation: DocBudgetObservation,
  exclusions: ReadonlySet<string> = DOWNSTREAM_DOC_BUDGET_EXCLUSIONS,
): DocBudgetReport {
  const failures: string[] = []
  const rows: string[] = []

  for (const [path, ceiling] of Object.entries(manifest)) {
    if (exclusions.has(path)) {
      rows.push(`skip  ${'—'.padStart(6)} / ${String(ceiling).padEnd(6)} ${path}`)
      continue
    }
    if (!Number.isInteger(ceiling) || ceiling <= 0) {
      rows.push(`BAD   ${'—'.padStart(6)} / ${String(ceiling).padEnd(6)} ${path}`)
      failures.push(`${path}: ceiling must be a positive integer, got ${ceiling}`)
      continue
    }
    if (!observation.exists(path)) {
      rows.push(`MISS  ${'—'.padStart(6)} / ${String(ceiling).padEnd(6)} ${path}`)
      failures.push(`${path}: budgeted file does not exist (renamed or deleted? update scripts/doc-budgets.manifest.json in the same change)`)
      continue
    }
    const words = observation.words(path)
    rows.push(`${words <= ceiling ? 'ok  ' : 'OVER'}  ${String(words).padStart(6)} / ${String(ceiling).padEnd(6)} ${path}`)
    if (words > ceiling) {
      failures.push(`${path}: ${words} words exceeds the ${ceiling}-word ceiling — relocate or condense per docs/AGENTS.md (raising the ceiling requires justification in the PR)`)
    }
  }

  return { failures, rows }
}

if (import.meta.main) {
  const listOnly = process.argv.includes('--list')
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, number>
  const report = evaluateDocBudgets(manifest, {
    exists: path => existsSync(resolve(root, path)),
    words: path => countDocBudgetWords(readFileSync(resolve(root, path), 'utf8')),
  })

  if (listOnly) {
    console.log(report.rows.join('\n'))
    process.exit(0)
  }

  if (report.failures.length > 0) {
    console.error('verify-doc-budgets failed:\n')
    for (const failure of report.failures) console.error(`  ${failure}`)
    console.error('\nSee docs/AGENTS.md for the documentation standard and the relocation-first rule.')
    process.exit(1)
  }

  const checked = Object.keys(manifest).filter(path => !DOWNSTREAM_DOC_BUDGET_EXCLUSIONS.has(path)).length
  console.log(`verify-doc-budgets: ${String(checked)} budgeted docs within ceiling.`)
}
