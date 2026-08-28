/**
 * Browser stand-in for `node:module` (vendored Cordis Loader probe).
 */

/** Throwing stand-in for node:module's createRequire (never reached in the browser boot). */
export const createRequire = (): never => {
  throw new Error('node:module is not available in the browser')
}

/** Erased type peer for the vendored loader's type-only LoadHookContext import. */
export type LoadHookContext = never
