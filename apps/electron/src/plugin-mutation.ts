/** Serializes every Main-owned mutation of profile packages and runtime composition. */
export class PluginMutationCoordinator {
  private queue = Promise.resolve()

  /**
   * Run one mutation after all earlier mutations settle.
   * @param operation - Mutation that owns the profile and runtime state until settlement.
   * @returns the operation result.
   */
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}
