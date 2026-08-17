/**
 * Replace generated workspace dependencies while retaining desktop-owned registry dependencies.
 *
 * @param {Readonly<Record<string, string>> | undefined} currentDependencies
 * @param {readonly string[]} generatedWorkspaceDependencies
 * @param {ReadonlySet<string>} workspaceNames
 * @returns {Record<string, string>}
 */
export function synchronizeDependencies(
  currentDependencies,
  generatedWorkspaceDependencies,
  workspaceNames,
) {
  const retainedDependencies = Object.entries(currentDependencies ?? {})
    .filter(([name]) => !workspaceNames.has(name))
  const workspaceDependencies = generatedWorkspaceDependencies
    .map(name => [name, 'workspace:^'])

  return Object.fromEntries(
    [...retainedDependencies, ...workspaceDependencies]
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}
