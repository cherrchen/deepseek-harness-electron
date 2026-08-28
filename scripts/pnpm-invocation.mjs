/** Resolve shell-free child-process invocations for the pnpm process that launched a package script. */

/**
 * Resolve pnpm's executable and arguments from its lifecycle environment.
 * @param {readonly string[]} args arguments to pass to pnpm.
 * @param {NodeJS.ProcessEnv} environment lifecycle environment containing `npm_execpath`.
 * @returns {{command: string, args: string[]}} command and arguments for a shell-free child process.
 */
export function pnpmInvocation(args, environment = process.env) {
  const entrypoint = environment.npm_execpath
  if (entrypoint === undefined || entrypoint === '') {
    throw new Error('pnpm invocation: npm_execpath is unavailable; invoke the script through pnpm run.')
  }
  if (/\.[cm]?js$/iu.test(entrypoint)) {
    return { command: process.execPath, args: [entrypoint, ...args] }
  }
  return { command: entrypoint, args: [...args] }
}
