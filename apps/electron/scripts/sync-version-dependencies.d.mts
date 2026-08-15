/** Replace generated workspace dependencies while retaining desktop-owned registry dependencies. */
export function synchronizeDependencies(
  currentDependencies: Readonly<Record<string, string>> | undefined,
  generatedWorkspaceDependencies: readonly string[],
  workspaceNames: ReadonlySet<string>,
): Record<string, string>
