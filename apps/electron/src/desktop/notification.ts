/** Options for an OS notification owned by Electron Main. */
export interface DesktopNotificationOptions {
  /** Notification title. */
  title: string
  /** Optional body text. */
  body?: string
  /** Opaque token echoed on click so the renderer can navigate. */
  payload?: string
}

/** Result of attempting to show an OS notification. */
export interface DesktopNotificationResult {
  /** Whether the notification was displayed. */
  shown: boolean
  /** True when the platform does not support OS notifications. */
  unsupported?: boolean
}

/**
 * Validate notification options from the renderer.
 * @param options - Candidate payload.
 * @returns Normalized options.
 * @throws When title is missing or not a string.
 */
export function requireNotificationOptions(options: unknown): DesktopNotificationOptions {
  if (!isRecord(options) || typeof options.title !== 'string' || options.title.trim().length === 0) {
    throw new Error('desktop notification: title is required')
  }
  return {
    title: options.title,
    ...(typeof options.body === 'string' ? { body: options.body } : {}),
    ...(typeof options.payload === 'string' ? { payload: options.payload } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
