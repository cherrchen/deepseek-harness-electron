/**
 * Typed errors thrown by `ctx.shellDetails` open-path validation and
 * takeover arbitration. Consumers should match with `instanceof`.
 */

/** No `shell.details.surface` contribution matches the requested surface id. */
export class DetailsSurfaceNotFoundError extends Error {
  readonly surfaceId: string

  /**
   * @param surfaceId - requested surface id that was absent from the ledger.
   */
  constructor(surfaceId: string) {
    super(`shellDetails: surface ${JSON.stringify(surfaceId)} is not registered`)
    this.name = 'DetailsSurfaceNotFoundError'
    this.surfaceId = surfaceId
  }
}

/**
 * More than one `shell.details.surface` contribution shares the same id.
 * Surface ids must be unique within the Host scope.
 */
export class DetailsSurfaceDuplicateError extends Error {
  readonly surfaceId: string
  readonly matchCount: number

  /**
   * @param surfaceId - duplicated surface id.
   * @param matchCount - number of matching contributions.
   */
  constructor(surfaceId: string, matchCount: number) {
    super(
      `shellDetails: surface ${JSON.stringify(surfaceId)} is registered ${String(matchCount)} times; surface ids must be unique`,
    )
    this.name = 'DetailsSurfaceDuplicateError'
    this.surfaceId = surfaceId
    this.matchCount = matchCount
  }
}

/**
 * DetailsHost registered into `details` but lost cell shadowing to another
 * occupant. Open state is rolled back before this error is thrown.
 */
export class DetailsTakeoverConflictError extends Error {
  readonly winnerId: string | undefined

  /**
   * @param winnerId - id of the winning `details` occupant, when present.
   */
  constructor(winnerId?: string) {
    const suffix = winnerId === undefined
      ? 'another details occupant won the cell'
      : `details winner is ${JSON.stringify(winnerId)}, not DetailsHost`
    super(`shellDetails: takeover conflict; ${suffix}`)
    this.name = 'DetailsTakeoverConflictError'
    this.winnerId = winnerId
  }
}
