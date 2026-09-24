import { createHash, randomUUID } from 'node:crypto'
import type { DesktopNetworkFailure, DesktopNetworkIncidentSummary, SanitizedResolvedRoute } from './domain.ts'

/** One incident record and whether a native dialog may be presented for it. */
export interface NetworkIncidentResult {
  incident: DesktopNetworkIncidentSummary
  showDialog: boolean
}

/** Deduplicates real traffic failures per epoch, selected route, and failure class. */
export class NetworkIncidentManager {
  private readonly seen = new Map<string, DesktopNetworkIncidentSummary>()
  private readonly retryGenerations = new Map<string, number>()
  private latest: DesktopNetworkIncidentSummary | undefined

  /** @param now - Clock for incident timestamps. @param id - Opaque incident ID generator. */
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = randomUUID,
  ) {}

  /** @returns the most recent sanitized incident. */
  last(): DesktopNetworkIncidentSummary | undefined { return this.latest }

  /** Release old dedupe records when a new policy generation supersedes them. */
  beginEpoch(): void {
    this.seen.clear()
    this.retryGenerations.clear()
    if (this.latest !== undefined && this.latest.resolvedAt === undefined) {
      this.latest = { ...this.latest, resolvedAt: this.now().toISOString() }
    }
  }

  /** Record a classified real traffic failure; diagnostic tests must not call this method. */
  report(input: {
    epochId: string
    mode: 'manual' | 'system'
    route?: SanitizedResolvedRoute
    routeFingerprint?: string
    failure: DesktopNetworkFailure
  }): NetworkIncidentResult | undefined {
    if (!input.failure.proxyFailure) return undefined
    const routeKey = input.routeFingerprint ?? createHash('sha256').update(JSON.stringify(input.route ?? null)).digest('hex')
    const baseKey = `${input.epochId}:${routeKey}:${input.failure.code}`
    const key = `${baseKey}:${String(this.retryGenerations.get(baseKey) ?? 0)}`
    const existing = this.seen.get(key)
    if (existing !== undefined) { this.latest = existing; return { incident: existing, showDialog: false } }
    const incident: DesktopNetworkIncidentSummary = {
      id: this.id(), createdAt: this.now().toISOString(), epochId: input.epochId,
      mode: input.mode, ...(input.route === undefined ? {} : { route: input.route }),
      failure: input.failure, dialogShown: true,
    }
    this.seen.set(key, incident)
    this.latest = incident
    return { incident, showDialog: true }
  }

  /** Allow one fresh dialog after the user retries; the business request is never replayed. */
  retry(incidentId: string): 'started' | 'no-failure' | 'stale-incident' {
    const incident = this.latest
    if (incident === undefined) return 'no-failure'
    if (incident.id !== incidentId || incident.resolvedAt !== undefined) return 'stale-incident'
    for (const [key, value] of this.seen) {
      if (value.id === incidentId) {
        const baseKey = key.slice(0, key.lastIndexOf(':'))
        this.retryGenerations.set(baseKey, (this.retryGenerations.get(baseKey) ?? 0) + 1)
        return 'started'
      }
    }
    return 'stale-incident'
  }

  /** Resolve the last matching incident after a request succeeds or its epoch is replaced. */
  resolve(epochId: string, route?: SanitizedResolvedRoute): DesktopNetworkIncidentSummary | undefined {
    const incident = this.latest
    if (incident === undefined || incident.epochId !== epochId || incident.resolvedAt !== undefined) return undefined
    if (route !== undefined && JSON.stringify(incident.route) !== JSON.stringify(route)) return undefined
    const resolved = { ...incident, resolvedAt: this.now().toISOString() }
    this.latest = resolved
    for (const [key, value] of this.seen) if (value.id === incident.id) this.seen.set(key, resolved)
    return resolved
  }
}
