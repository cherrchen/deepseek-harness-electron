import { randomUUID } from 'node:crypto'
import type { NetworkEpochReason, NetworkEpochSummary } from './domain.ts'

/** Tracks meaningful System policy generations without creating epochs for request failures. */
export class NetworkEpochManager {
  private current: NetworkEpochSummary | undefined

  /** @param now - Clock for the epoch timestamp. @param id - Opaque epoch ID generator. */
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = randomUUID,
  ) {}

  /** @returns the current epoch, if managed routing has started. */
  state(): NetworkEpochSummary | undefined { return this.current }

  /** Start a generation after a mode is applied or the user explicitly reloads policy. */
  begin(reason: NetworkEpochReason, policyFingerprint?: string, networkFingerprint?: string): NetworkEpochSummary {
    this.current = {
      id: this.id(), startedAt: this.now().toISOString(), reason,
      ...(policyFingerprint === undefined ? {} : { policyFingerprint }),
      ...(networkFingerprint === undefined ? {} : { networkFingerprint }),
    }
    return this.current
  }

  /** @returns a new epoch only when an observed policy or network fingerprint changed. */
  observe(reason: 'system-policy-changed' | 'network-changed', policyFingerprint: string, networkFingerprint: string): NetworkEpochSummary | undefined {
    if (this.current === undefined) return this.begin(reason, policyFingerprint, networkFingerprint)
    if (this.current.policyFingerprint === policyFingerprint && this.current.networkFingerprint === networkFingerprint) return undefined
    return this.begin(reason, policyFingerprint, networkFingerprint)
  }
}
