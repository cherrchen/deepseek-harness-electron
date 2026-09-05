/** Launcher contributions advertised by the Git plugin in the Details Launcher. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DetailsLauncherContribution } from '@dsh-electron/dsh-client-ui-details-host/client'
import { GIT_CHANGES_SURFACE_ID, GIT_GRAPH_SURFACE_ID } from './contract.ts'
import { BranchGlyph, GraphGlyph } from './LauncherIcons.tsx'

/**
 * Build the Git launcher cards: one entry per user-facing surface. Copy comes
 * from the locale dictionary so cards re-resolve on every language switch
 * (the registration site rebuilds the cards when the locale revision moves).
 * The Launcher renders these dynamically; unloading the plugin disposes them.
 * @param t - Translate function of the Git locale namespace.
 * @returns The Git launcher contributions.
 */
export function createLauncherCards(t: TranslateNS<'git'>): readonly DetailsLauncherContribution[] {
  return [
    {
      id: 'git.changes',
      pluginId: 'dsh-plugin-git',
      title: t('launcher.changes.title'),
      description: t('launcher.changes.description'),
      icon: <BranchGlyph />,
      order: 10,
      open: () => ({ surfaceId: GIT_CHANGES_SURFACE_ID }),
    },
    {
      id: 'git.graph',
      pluginId: 'dsh-plugin-git',
      title: t('launcher.graph.title'),
      description: t('launcher.graph.description'),
      icon: <GraphGlyph />,
      order: 11,
      open: () => ({ surfaceId: GIT_GRAPH_SURFACE_ID }),
    },
  ]
}
