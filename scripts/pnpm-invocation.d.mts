/**
 * Resolve pnpm's executable and arguments from its lifecycle environment.
 * @param args - Arguments to pass to pnpm.
 * @param environment - Lifecycle environment containing `npm_execpath`.
 * @returns A command and argument array suitable for a shell-free child process.
 */
export function pnpmInvocation(
  args: readonly string[],
  environment?: NodeJS.ProcessEnv,
): { command: string; args: string[] }
