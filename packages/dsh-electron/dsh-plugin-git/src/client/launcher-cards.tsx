/** Launcher contributions advertised by the Git plugin in the Details Launcher. */
import type { DetailsLauncherContribution } from '@dsh-electron/dsh-client-ui-details-host/client'
import { GIT_CHANGES_SURFACE_ID, GIT_GRAPH_SURFACE_ID } from './contract.ts'
import { BranchGlyph, GraphGlyph } from './LauncherIcons.tsx'

/**
 * Build the Git launcher cards: one entry per user-facing surface. The
 * Launcher renders these dynamically; unloading the plugin disposes them.
 * @returns The Git launcher contributions.
 */
export function createLauncherCards(): readonly DetailsLauncherContribution[] {
  return [
    {
      id: 'git.changes',
      pluginId: 'dsh-plugin-git',
      title: 'Git',
      description: 'Changes, staging, and commit',
      icon: <BranchGlyph />,
      order: 10,
      open: () => ({ surfaceId: GIT_CHANGES_SURFACE_ID }),
    },
    {
      id: 'git.graph',
      pluginId: 'dsh-plugin-git',
      title: 'Git Graph',
      description: 'Commit history visualization',
      icon: <GraphGlyph />,
      order: 11,
      open: () => ({ surfaceId: GIT_GRAPH_SURFACE_ID }),
    },
  ]
}
