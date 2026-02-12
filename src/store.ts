import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { initialApiState, STORAGE_KEY } from './constants'
import {
  ApiCallOptions,
  ApiError,
  ApiMiddlewareHandler,
  ApiState,
  ApiStore,
  ApiStoreConfig,
  FetchStatus
} from './types'
import type { StoreApi, UseBoundStore } from 'zustand'

/** Abort-aware sleep that rejects early when the signal fires. */
const abortableSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'))
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })

/** Races a promise against an AbortSignal so hanging requests can be interrupted. */
const raceWithSignal = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise
  if (signal.aborted) {
    promise.catch(() => {}) // prevent unhandled rejection from orphaned promise
    return Promise.reject(new Error('Aborted'))
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false

    const onAbort = () => {
      if (!settled) {
        settled = true
        reject(new Error('Aborted'))
      }
    }

    signal.addEventListener('abort', onAbort, { once: true })

    promise.then(
      value => {
        if (!settled) {
          settled = true
          signal.removeEventListener('abort', onAbort)
          resolve(value)
        }
      },
      error => {
        if (!settled) {
          settled = true
          signal.removeEventListener('abort', onAbort)
          reject(error)
        }
        // If already settled via abort, swallow the rejection to prevent unhandled errors
      }
    )
  })
}

/** SSR-safe fallback that returns a no-op storage when `localStorage` is unavailable. */
const getSafeStorage = (): StateStorage => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage
  }
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
}

/**
 * Internal counter map for race-condition protection.
 * Tracks the latest request ID per API key so stale responses are discarded.
 */
const activeRequests: Record<string, number> = {}

/** Tracks in-flight promises per key for request deduplication. */
const pendingRequests = new Map<string, Promise<unknown>>()

/**
 * Dev-time registry that maps each API key to the store instance that owns it.
 * Warns when the same key is used across different store instances to prevent
 * accidental collisions in the shared `activeRequests` / `pendingRequests` maps.
 */
const keyOwnerRegistry =
  process.env.NODE_ENV !== 'production' ? new Map<string, object>() : null

/** Warns once per key if a different store tries to claim it. */
const warnedKeys = process.env.NODE_ENV !== 'production' ? new Set<string>() : null

const checkKeyOwnership = (key: string, storeRef: object) => {
  if (!keyOwnerRegistry || !warnedKeys) return
  const owner = keyOwnerRegistry.get(key)
  if (owner && owner !== storeRef && !warnedKeys.has(key)) {
    warnedKeys.add(key)
    console.warn(
      `[zustand-api-manager] Key "${key}" is already used by another store instance. ` +
        `Using the same key across different stores will cause shared race-condition tracking ` +
        `and deduplication to interfere. Use unique key names per store or use the singleton store.`
    )
  }
  keyOwnerRegistry.set(key, storeRef)
}

const releaseKeyOwnership = (key: string) => {
  if (!keyOwnerRegistry || !warnedKeys) return
  keyOwnerRegistry.delete(key)
  warnedKeys.delete(key)
}

/**
 * Creates a new Zustand store instance for managing API states.
 *
 * @param config - Optional configuration for storage key and custom storage.
 * @returns An object containing the store hook (`useStore`).
 *
 * @remarks
 * For a version that returns pre-bound convenience hooks, import {@link createApiStore}
 * from the package root (`zustand-api-manager`), which wraps this and also provides
 * `useApiHandler`, `useLoadingStates`, and `createApiComposer` bound to the store.
 *
 * @example
 * ```ts
 * const { useStore, useApiHandler, useLoadingStates, createApiComposer } = createApiStore({
 *   storageKey: 'my-app-api',
 * })
 * ```
 */
export function createApiStore(config: ApiStoreConfig = {}) {
  const { storageKey = STORAGE_KEY, storage: customStorage } = config

  /** Stable identity object used to track key ownership for this store instance. */
  const storeRef = {}

  const useStore = create<ApiStore>()(
    persist(
      immer((set, get) => ({
        apiStates: {},
        persistentKeys: {} as Record<string, boolean>,
        middleware: [],
        errorHandlers: [],

        setApiState: <T>(key: string, state: Partial<ApiState<T>>, shouldPersist = false) =>
          set(draft => {
            if (!draft.apiStates[key]) {
              checkKeyOwnership(key, storeRef)
              draft.apiStates[key] = { ...initialApiState } as ApiState<T>
            }

            const prevState = draft.apiStates[key] as ApiState<T>
            Object.assign(prevState, state)

            if (shouldPersist) {
              draft.persistentKeys[key] = true
            } else {
              delete draft.persistentKeys[key]
            }
          }),

        resetApiState: (key: string) => {
          // Clean up race-condition counter and pending dedup to prevent memory leak
          delete activeRequests[key]
          pendingRequests.delete(key)
          releaseKeyOwnership(key)
          set(draft => {
            delete draft.apiStates[key]
            delete draft.persistentKeys[key]
          })
        },

        invalidateApi: (key: string) =>
          set(draft => {
            if (draft.apiStates[key]) {
              draft.apiStates[key].fetchedAt = null
            }
          }),

        handleApi: <T>(
          key: string,
          apiCall: () => Promise<{ data: T }>,
          options: ApiCallOptions<T> = {}
        ): Promise<T | undefined> => {
          checkKeyOwnership(key, storeRef)
          const { staleTime, dedupe } = options

          // Cache / staleTime: skip fetch if data is fresh enough
          if (staleTime != null && staleTime > 0) {
            const existing = get().apiStates[key]
            if (
              existing?.status === FetchStatus.SUCCESS &&
              existing.fetchedAt != null &&
              Date.now() - existing.fetchedAt < staleTime
            ) {
              return Promise.resolve(existing.data as T)
            }
          }

          // Deduplication: return existing in-flight promise for this key
          if (dedupe) {
            const existing = pendingRequests.get(key)
            if (existing) return existing as Promise<T | undefined>
          }

          const promise = (async (): Promise<T | undefined> => {
            const { setApiState } = get()
            const { retry = 0, optimisticData, timeout } = options

            // Timeout setup: create a combined signal that respects both user signal and timeout
            let timeoutId: ReturnType<typeof setTimeout> | undefined
            let timedOut = false
            let effectiveOptions = options

            if (timeout != null && timeout > 0) {
              const timeoutController = new AbortController()
              timeoutId = setTimeout(() => {
                timedOut = true
                timeoutController.abort()
              }, timeout)

              // Forward user signal abort to timeout controller
              if (options.signal) {
                if (options.signal.aborted) {
                  timeoutController.abort()
                } else {
                  options.signal.addEventListener('abort', () => timeoutController.abort(), {
                    once: true
                  })
                }
              }

              effectiveOptions = { ...options, signal: timeoutController.signal }
            }

            // Race condition protection: increment the counter for this key
            const requestId = (activeRequests[key] = (activeRequests[key] ?? 0) + 1)
            const isStale = () => activeRequests[key] !== requestId

            // Save previous data for optimistic rollback
            const previousData = get().apiStates[key]?.data ?? null

            // Optimistic update: set data immediately while request is in-flight
            if (optimisticData !== undefined) {
              setApiState<T>(
                key,
                { status: FetchStatus.LOADING, data: optimisticData },
                effectiveOptions.persist
              )
            }

            const handleError = (error: ApiError) => {
              if (isStale()) return
              // Roll back to previous data when optimistic update was used
              const rollbackData = optimisticData !== undefined ? previousData : null
              setApiState<T>(
                key,
                { status: FetchStatus.ERROR, error, data: rollbackData as T | null },
                effectiveOptions.persist
              )
              // Read errorHandlers fresh to avoid stale closure references
              get().errorHandlers.forEach(handler => handler(error, key))
              effectiveOptions.onError?.(error)
            }

            const baseHandler: ApiMiddlewareHandler = async (key, apiCall, opts) => {
              if (isStale()) return

              // Only set LOADING if we didn't already set it via optimistic update
              if (optimisticData === undefined) {
                setApiState(key, { status: FetchStatus.LOADING }, opts.persist)
              }

              let lastError: ApiError | undefined
              const maxAttempts = (opts.retry ?? 0) + 1
              const backoffFn =
                opts.backoff ?? ((attempt: number) => Math.min(1000 * 2 ** attempt, 10000))

              for (let attempt = 0; attempt < maxAttempts; attempt++) {
                if (opts.signal?.aborted) {
                  const abortError: ApiError = new Error(
                    timedOut ? 'Request timed out' : 'Aborted'
                  )
                  abortError.code = timedOut ? 'TIMEOUT' : 'ABORT_ERR'
                  handleError(abortError)
                  return
                }

                try {
                  const response = await raceWithSignal(apiCall(), opts.signal)
                  if (isStale()) return
                  setApiState(
                    key,
                    {
                      status: FetchStatus.SUCCESS,
                      data: response.data,
                      error: null,
                      fetchedAt: Date.now()
                    },
                    opts.persist
                  )
                  opts.onSuccess?.(response.data)
                  return
                } catch (error) {
                  if (isStale()) return

                  if (opts.signal?.aborted) {
                    const abortError: ApiError = new Error(
                      timedOut ? 'Request timed out' : 'Aborted'
                    )
                    abortError.code = timedOut ? 'TIMEOUT' : 'ABORT_ERR'
                    handleError(abortError)
                    return
                  }

                  const apiError: ApiError =
                    error instanceof Error ? error : new Error('An unknown error occurred')
                  if (error && typeof error === 'object' && 'status' in error) {
                    apiError.status = error.status as number
                  }
                  if (error && typeof error === 'object' && 'code' in error) {
                    apiError.code = error.code as string
                  }

                  // Check shouldRetry predicate
                  if (opts.shouldRetry && !opts.shouldRetry(apiError, attempt)) {
                    handleError(apiError)
                    return
                  }

                  lastError = apiError

                  if (attempt < maxAttempts - 1) {
                    try {
                      await abortableSleep(backoffFn(attempt), opts.signal)
                    } catch {
                      // Sleep was aborted — treat as abort/timeout error
                      const abortError: ApiError = new Error(
                        timedOut ? 'Request timed out' : 'Aborted'
                      )
                      abortError.code = timedOut ? 'TIMEOUT' : 'ABORT_ERR'
                      handleError(abortError)
                      return
                    }
                  }
                }
              }

              if (lastError) {
                handleError(lastError)
              }
            }

            // Read middleware fresh at call time
            const composedHandler = get().middleware.reduce<ApiMiddlewareHandler>(
              (next, mid) => mid(next),
              baseHandler
            )

            try {
              await composedHandler(key, apiCall, { ...effectiveOptions, retry })
            } finally {
              // Clean up timeout timer
              if (timeoutId) clearTimeout(timeoutId)
              // Call onSettled regardless of outcome (but not for stale/dedup callers)
              options.onSettled?.()
            }

            // Return the data if the request succeeded and wasn't superseded
            if (isStale()) return undefined
            const finalState = get().apiStates[key]
            if (finalState?.status === FetchStatus.SUCCESS) {
              return finalState.data as T
            }
            return undefined
          })()

          // Track for deduplication
          if (dedupe) {
            pendingRequests.set(key, promise)
            promise.finally(() => pendingRequests.delete(key))
          }

          return promise
        },

        startPolling: <T>(
          key: string,
          apiCall: () => Promise<{ data: T }>,
          interval: number,
          options?: ApiCallOptions<T>
        ) => {
          const id = setInterval(() => get().handleApi(key, apiCall, options), interval)
          return () => clearInterval(id)
        },

        addMiddleware: middleware => {
          set(state => ({ middleware: [...state.middleware, middleware] }))
          return () => {
            set(state => ({
              middleware: state.middleware.filter(m => m !== middleware)
            }))
          }
        },

        addErrorHandler: handler => {
          set(state => ({
            errorHandlers: [...state.errorHandlers, handler]
          }))
          return () => {
            set(state => ({
              errorHandlers: state.errorHandlers.filter(h => h !== handler)
            }))
          }
        }
      })),
      {
        name: storageKey,
        storage: createJSONStorage(() => (customStorage as StateStorage) ?? getSafeStorage()),
        partialize: state => ({
          apiStates: Object.fromEntries(
            Object.entries(state.apiStates).filter(([key]) => state.persistentKeys[key])
          ),
          persistentKeys: state.persistentKeys
        }),
        onRehydrateStorage: () => (_state, error) => {
          if (error) {
            console.error('Error rehydrating state:', error)
          }
        }
      }
    )
  )

  return { useStore }
}

/**
 * The default singleton API store, created with default configuration.
 *
 * Uses `immer` middleware for immutable state updates and `persist` middleware
 * for optional `localStorage` persistence. Only API keys explicitly marked with
 * `persist: true` in their `ApiCallOptions` will survive page reloads.
 *
 * @example
 * ```ts
 * // Direct store access
 * const { handleApi, addMiddleware, addErrorHandler } = useApiStore.getState()
 *
 * // Reactive usage in a React component
 * const apiStates = useApiStore(state => state.apiStates)
 * ```
 */
export const useApiStore: UseBoundStore<StoreApi<ApiStore>> = createApiStore().useStore
