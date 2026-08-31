/**
 * Client half fixture entry.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** Fixture client plugin inject declaration. */
export const inject = ['sessions']

/**
 * @param ctx - Client root context.
 */
export function apply(_ctx: ClientContext): void {}
