import type { PluginMutationDescriptor } from './plugin-lifecycle-contract.ts'

/** Serializes every Main-owned mutation of profile packages and runtime composition. */
export class PluginMutationCoordinator {
  private queue = Promise.resolve()
  private activeOperation: PluginMutationDescriptor | undefined

  /** @returns the mutation currently executing in Main. */
  getActiveOperation(): PluginMutationDescriptor | undefined {
    return this.activeOperation
  }

  /**
   * Run one mutation after all earlier mutations settle.
   * @param operation - Mutation that owns the profile and runtime state until settlement.
   * @returns the operation result.
   */
  run<T>(descriptor: PluginMutationDescriptor, operation: () => Promise<T>): Promise<T> {
    const execute = async (): Promise<T> => {
      this.activeOperation = descriptor
      try {
        return await operation()
      } finally {
        this.activeOperation = undefined
      }
    }
    const result = this.queue.then(execute, execute)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}
