/**
 * Replace generated workspace dependencies while retaining desktop-owned registry dependencies.
 *
 * A leftover `workspace:` specifier whose package is absent from the merged
 * workspace is dropped. The `workspace:` protocol cannot be fetched from npm.
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
    .filter(([name, specifier]) => !specifier.startsWith('workspace:') && !workspaceNames.has(name))
  const workspaceDependencies = generatedWorkspaceDependencies
    .map(name => [name, 'workspace:^'])

  return Object.fromEntries(
    [...retainedDependencies, ...workspaceDependencies]
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

/**
 * @param {Readonly<Record<string, string>>} dependencies
 * @param {ReadonlySet<string>} workspaceNames
 */
export function assertResolvedWorkspaceDependencies(dependencies, workspaceNames) {
  for (const [name, specifier] of Object.entries(dependencies)) {
    if (specifier === 'workspace:^' && !workspaceNames.has(name)) {
      throw new Error(`Electron dependency ${name} is not present in the workspace`)
    }
  }
}
