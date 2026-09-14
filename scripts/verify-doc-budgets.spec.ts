import { describe, expect, it } from 'vitest'
import {
  DOWNSTREAM_DOC_BUDGET_EXCLUSIONS,
  evaluateDocBudgets,
} from './verify-doc-budgets.ts'

describe('downstream doc-budget exclusions', () => {
  it('skips root AGENTS.md even when the upstream ceiling is exceeded', () => {
    const report = evaluateDocBudgets(
      { 'AGENTS.md': 10, 'docs/AGENTS.md': 100 },
      {
        exists: () => true,
        words: path => path === 'AGENTS.md' ? 11 : 50,
      },
    )

    expect(DOWNSTREAM_DOC_BUDGET_EXCLUSIONS.has('AGENTS.md')).toBe(true)
    expect(report.failures).toEqual([])
    expect(report.rows.some(row => row.startsWith('skip') && row.endsWith('AGENTS.md'))).toBe(true)
  })

  it('still rejects an over-budget file this fork can edit', () => {
    const report = evaluateDocBudgets(
      { 'docs/AGENTS.md': 10 },
      { exists: () => true, words: () => 11 },
    )

    expect(report.failures).toEqual([
      'docs/AGENTS.md: 11 words exceeds the 10-word ceiling — relocate or condense per docs/AGENTS.md (raising the ceiling requires justification in the PR)',
    ])
  })

  it('still rejects a missing budgeted file that is not excluded', () => {
    const report = evaluateDocBudgets(
      { 'docs/testing.md': 10 },
      { exists: () => false, words: () => 0 },
    )

    expect(report.failures).toEqual([
      'docs/testing.md: budgeted file does not exist (renamed or deleted? update scripts/doc-budgets.manifest.json in the same change)',
    ])
  })
})
