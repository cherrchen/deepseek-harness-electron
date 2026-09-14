/** Startup recovery when pending package state or Host boot cannot be trusted. */

/** Why Desktop must not start Host until the user repairs plugin state. */
export type PluginRecoveryReason =
  | 'pending-reconcile-failed'
  | 'lock-timeout'
  | 'profile-reconcile-failed'
  | 'host-timeout'

/** User action offered by the Main-owned recovery window. */
export type PluginRecoveryAction = 'disable-all' | 'reset-management'

/**
 * Typed startup failure that must not spawn Host until the user repairs plugin state.
 */
export class PluginRecoveryError extends Error {
  /**
   * @param message - User-facing summary.
   * @param reason - Recovery trigger.
   * @param details - Optional diagnostic text.
   */
  constructor(
    message: string,
    readonly reason: PluginRecoveryReason,
    readonly details?: string,
  ) {
    super(message)
    this.name = 'PluginRecoveryError'
  }
}

/**
 * Test-only abort that leaves pending and lock files on disk, simulating Main death.
 */
export class PluginMutationCrashInjection extends Error {
  /**
   * @param point - Crash injection site inside a package transaction.
   */
  constructor(readonly point: PluginMutationCrashPoint) {
    super(`plugin mutation crash injected at ${point}`)
    this.name = 'PluginMutationCrashInjection'
  }
}

/** Crash sites covering pending write, command settlement, inspect, and marker clear. */
export type PluginMutationCrashPoint =
  | 'after-pending-write'
  | 'after-command'
  | 'after-inspect'
  | 'before-pending-clear'

/** Optional hook used by crash-injection tests. */
export type PluginMutationCrashHook = (point: PluginMutationCrashPoint) => void

/**
 * Present recovery for a typed startup failure, then retry the same operation.
 * @param run - Host start or catalog read that may throw {@link PluginRecoveryError}.
 * @param presentRecovery - Main-owned recovery UI; must not spawn Host itself.
 * @param afterRecovery - Optional roster rewrite after the user repairs state.
 * @returns The successful retry result.
 */
export async function retryAfterPluginRecovery<T>(
  run: () => Promise<T>,
  presentRecovery: (error: PluginRecoveryError) => Promise<void>,
  afterRecovery?: () => Promise<void>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof PluginRecoveryError)) throw error
    await presentRecovery(error)
    await afterRecovery?.()
    return await run()
  }
}

/**
 * Stop a timed-out Host before allowing startup recovery.
 * @param stop - Shutdown operation that resolves only after Host exits.
 * @param timeoutError - Recoverable startup timeout.
 * @returns Never resolves; shutdown failure prevents recovery and retry.
 */
export async function failAfterHostTimeout(stop: () => Promise<void>, timeoutError: PluginRecoveryError): Promise<never> {
  try {
    await stop()
  } catch (cleanupError) {
    throw new AggregateError([timeoutError, cleanupError], `${timeoutError.message} Harness shutdown also failed.`)
  }
  throw timeoutError
}
