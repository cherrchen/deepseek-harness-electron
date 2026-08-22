/**
 * Client half fixture entry.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** Fixture client plugin inject declaration. */
export const inject = ['sessions']

/**
 * @param ctx - Client root context.
 */
export function apply(_ctx: ClientContext): void {}
