/**
 * Notification stub.
 *
 * The Gmail notification layer has been removed at the MLRO's request.
 * This file is kept as a no-op stub so the existing `import { notify }`
 * statements in every script continue to resolve without changes.
 *
 * If a different notification channel is added in the future, implement
 * it here and export the replacement from this same `notify` function.
 * Callers pass `{ subject, body, url }` and expect an object of shape
 * `{ sent: number, failed: number }` back.
 */

// eslint-disable-next-line no-unused-vars
export async function notify(_args) {
  return { sent: 0, failed: 0 };
}
