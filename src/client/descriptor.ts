/**
 * Surface descriptor registry and lifecycle invocation. Descriptors carry
 * behavior metadata only; renderable contributions stay on the slot ledger.
 */
import type {
  DetailsSurfaceCloseReason,
  DetailsSurfaceDescriptor,
  DetailsSurfaceInstance,
} from './contract.ts'

/** Mutable registry of surface behavior descriptors. */
export class DetailsDescriptorRegistry {
  readonly #byId = new Map<string, DetailsSurfaceDescriptor>()

  /**
   * Register one descriptor. Duplicate ids throw.
   * @param descriptor - behavior metadata for a surface id.
   * @returns disposer that removes the descriptor.
   */
  register<P>(descriptor: DetailsSurfaceDescriptor<P>): () => void {
    const id = descriptor.id
    if (this.#byId.has(id)) {
      throw new Error(`shellDetails: surface descriptor ${JSON.stringify(id)} is already registered`)
    }
    this.#byId.set(id, descriptor as DetailsSurfaceDescriptor)
    return () => {
      if (this.#byId.get(id) === descriptor) this.#byId.delete(id)
    }
  }

  /**
   * Look up a descriptor by surface id.
   * @param id - surface id.
   * @returns the descriptor, or undefined when absent (legacy consumers).
   */
  get(id: string): DetailsSurfaceDescriptor | undefined {
    return this.#byId.get(id)
  }

  /** Remove every descriptor (host unload). */
  clear(): void {
    this.#byId.clear()
  }
}

/**
 * Invoke a lifecycle callback; Host transitions continue after callback errors.
 * @param label - diagnostic label for the console error.
 * @param invoke - callback body.
 */
export function invokeLifecycle(label: string, invoke: () => void): void {
  try {
    invoke()
  } catch (error) {
    console.error(`shellDetails: ${label} failed`, error)
  }
}

/**
 * Run open then activate for a newly created instance.
 * @param registry - descriptor registry.
 * @param instance - committed instance.
 */
export function notifyOpened(
  registry: DetailsDescriptorRegistry,
  instance: DetailsSurfaceInstance,
): void {
  const descriptor = registry.get(instance.surfaceId)
  if (descriptor === undefined) return
  if (descriptor.onOpen !== undefined) {
    invokeLifecycle(`onOpen(${JSON.stringify(instance.surfaceId)})`, () => {
      descriptor.onOpen!(instance)
    })
  }
  notifyActivated(registry, instance)
}

/**
 * Run activate only (dedupe reuse or history restore).
 * @param registry - descriptor registry.
 * @param instance - activated instance.
 */
export function notifyActivated(
  registry: DetailsDescriptorRegistry,
  instance: DetailsSurfaceInstance,
): void {
  const descriptor = registry.get(instance.surfaceId)
  if (descriptor?.onActivate === undefined) return
  invokeLifecycle(`onActivate(${JSON.stringify(instance.surfaceId)})`, () => {
    descriptor.onActivate!(instance)
  })
}

/**
 * Run deactivate only (push into history or session switch away).
 * @param registry - descriptor registry.
 * @param instance - deactivated instance.
 */
export function notifyDeactivated(
  registry: DetailsDescriptorRegistry,
  instance: DetailsSurfaceInstance,
): void {
  const descriptor = registry.get(instance.surfaceId)
  if (descriptor?.onDeactivate === undefined) return
  invokeLifecycle(`onDeactivate(${JSON.stringify(instance.surfaceId)})`, () => {
    descriptor.onDeactivate!(instance)
  })
}

/**
 * Run deactivate then close for a leaving instance.
 * @param registry - descriptor registry.
 * @param instance - instance being closed.
 * @param reason - close reason vocabulary entry.
 * @param options - set `deactivate` false for inactive history entries.
 */
export function notifyClosed(
  registry: DetailsDescriptorRegistry,
  instance: DetailsSurfaceInstance,
  reason: DetailsSurfaceCloseReason,
  options: { deactivate?: boolean } = {},
): void {
  const deactivate = options.deactivate !== false
  const descriptor = registry.get(instance.surfaceId)
  if (descriptor === undefined) return
  if (deactivate && descriptor.onDeactivate !== undefined) {
    invokeLifecycle(`onDeactivate(${JSON.stringify(instance.surfaceId)})`, () => {
      descriptor.onDeactivate!(instance)
    })
  }
  if (descriptor.onClose !== undefined) {
    invokeLifecycle(`onClose(${JSON.stringify(instance.surfaceId)})`, () => {
      descriptor.onClose!(instance, reason)
    })
  }
}
