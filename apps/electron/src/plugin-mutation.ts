import type { PluginMutationDescriptor } from './plugin-lifecycle-contract.ts'

/** Serializes every Main-owned mutation of profile packages and runtime composition. */
export class PluginMutationCoordinator {
  private queue = Promise.resolve()
  private activeOperation: PluginMutationDescriptor | undefined
  private accepting = true

  /** @returns the mutation currently executing in Main. */
  getActiveOperation(): PluginMutationDescriptor | undefined {
    return this.activeOperation
  }

  /**
   * Run one mutation after all earlier mutations settle.
   * @param descriptor - Identity of the mutation occupying the queue.
   * @param operation - Mutation that owns the profile and runtime state until settlement.
   * @returns the operation result.
   */
  run<T>(descriptor: PluginMutationDescriptor, operation: () => Promise<T>): Promise<T> {
    if (!this.accepting) {
      return Promise.reject(new Error('plugin mutations: shutdown'))
    }
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

  /**
   * Refuse later mutations and wait until every accepted mutation settles.
   * @returns Completion after the queue is idle.
   */
  shutdown(): Promise<void> {
    this.accepting = false
    return this.queue
  }
}
