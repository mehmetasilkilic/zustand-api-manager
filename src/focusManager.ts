type Callback = () => void

function createEventManager(
  setup: (notify: () => void) => () => void
) {
  const subscribers = new Set<Callback>()
  let teardown: (() => void) | null = null

  return function subscribe(callback: Callback): Callback {
    subscribers.add(callback)

    if (subscribers.size === 1) {
      teardown = setup(() => {
        subscribers.forEach(cb => cb())
      })
    }

    return () => {
      subscribers.delete(callback)
      if (subscribers.size === 0 && teardown) {
        teardown()
        teardown = null
      }
    }
  }
}

/**
 * Subscribes to window focus events (`visibilitychange`).
 * The callback fires when the document becomes visible.
 *
 * SSR-safe: returns a no-op unsubscribe if `window` is not available.
 *
 * @param callback - Invoked when the window regains focus.
 * @returns An unsubscribe function.
 */
export const onWindowFocus: (callback: Callback) => Callback =
  typeof window === 'undefined' || typeof document === 'undefined'
    ? () => () => {}
    : createEventManager(notify => {
        const handler = () => {
          if (document.visibilityState === 'visible') notify()
        }
        document.addEventListener('visibilitychange', handler)
        return () => document.removeEventListener('visibilitychange', handler)
      })

/**
 * Subscribes to network reconnect events (`online`).
 * The callback fires when the browser comes back online.
 *
 * SSR-safe: returns a no-op unsubscribe if `window` is not available.
 *
 * @param callback - Invoked when the network reconnects.
 * @returns An unsubscribe function.
 */
export const onReconnect: (callback: Callback) => Callback =
  typeof window === 'undefined'
    ? () => () => {}
    : createEventManager(notify => {
        window.addEventListener('online', notify)
        return () => window.removeEventListener('online', notify)
      })
