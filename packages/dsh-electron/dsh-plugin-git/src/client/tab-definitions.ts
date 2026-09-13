/**
 * Stage one of the Git tab-type registrations: what each type IS.
 *
 * Changes and Graph are page types (opened by kind, no address claimed); Diff
 * is a resource type over `dsh-resource://git/diff/...`, where the exact
 * address is the tab identity, so re-opening a file reveals its tab. Guide
 * entries replace the old Details launcher cards.
 */
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import {
  GIT_CHANGES_ID,
  GIT_CHANGES_KIND,
  GIT_DIFF_ID,
  GIT_DIFF_KIND,
  GIT_GRAPH_ID,
  GIT_GRAPH_KIND,
  GIT_DIFF_RESOURCE_PROTOCOL,
  parseGitDiffAddress,
} from './contract.ts'
import { splitRepoPath } from './path-display.ts'
import { BranchGlyph, GraphGlyph } from './LauncherIcons.tsx'

/**
 * The Changes page type, plus its guide entry.
 * @param t - Namespace-bound translate, read fresh on every label call.
 * @returns The definition to register.
 */
export function changesDefinition(t: TranslateNS<'git'>): SidebarRightTabDefinition {
  return {
    id: GIT_CHANGES_ID,
    kind: GIT_CHANGES_KIND,
    title: () => t('tab.changes'),
    guide: [{
      order: 10,
      title: () => t('launcher.changes.title'),
      description: () => t('launcher.changes.description'),
      icon: BranchGlyph,
    }],
  }
}

/**
 * The Diff resource type: claims the Git diff address grammar and titles tabs
 * after the changed file.
 */
export function diffDefinition(): SidebarRightTabDefinition {
  return {
    id: GIT_DIFF_ID,
    kind: GIT_DIFF_KIND,
    patterns: [`dsh-resource://${GIT_DIFF_RESOURCE_PROTOCOL}/diff/**`],
    canOpen: address => parseGitDiffAddress(address) !== undefined,
    title: (address) => {
      const payload = parseGitDiffAddress(address)
      return payload === undefined ? 'Diff' : splitRepoPath(payload.path).name
    },
  }
}

/**
 * The Graph page type, plus its guide entry.
 * @param t - Namespace-bound translate, read fresh on every label call.
 * @returns The definition to register.
 */
export function graphDefinition(t: TranslateNS<'git'>): SidebarRightTabDefinition {
  return {
    id: GIT_GRAPH_ID,
    kind: GIT_GRAPH_KIND,
    title: () => t('tab.graph'),
    guide: [{
      order: 11,
      title: () => t('launcher.graph.title'),
      description: () => t('launcher.graph.description'),
      icon: GraphGlyph,
    }],
  }
}
