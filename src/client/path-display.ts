/** Split a repository-relative path into filename and directory parts. */

/**
 * Split one repository-relative path for compact display.
 * @param path - Repository-relative path.
 * @returns Filename and optional directory prefix.
 */
export function splitRepoPath(path: string): { readonly name: string; readonly dir: string } {
  const index = path.lastIndexOf('/')
  if (index === -1) return { name: path, dir: '' }
  return { name: path.slice(index + 1), dir: path.slice(0, index + 1) }
}

/**
 * Read the repository folder name from an absolute root path.
 * @param root - Repository root path.
 * @returns Final path segment for display.
 */
export function repoFolderName(root: string): string {
  const normalized = root.replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? normalized : normalized.slice(index + 1)
}
