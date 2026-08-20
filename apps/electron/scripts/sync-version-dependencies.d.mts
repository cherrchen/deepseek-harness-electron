/**
 * Replace generated workspace dependencies while retaining desktop-owned registry dependencies.
 * Drops leftover `workspace:` specifiers whose packages are absent from the workspace.
 */
export function synchronizeDependencies(
  currentDependencies: Readonly<Record<string, string>> | undefined,
  generatedWorkspaceDependencies: readonly string[],
  workspaceNames: ReadonlySet<string>,
): Record<string, string>
