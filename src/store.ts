import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { createJSONStorage, devtools, persist, type StateStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { initialApiState, STORAGE_KEY } from './constants'
import { mergeWithGlobalConfig, getGlobalConfig } from './config'
import {
  FetchStatus,
  type ApiCallOptions,
  type ApiError,
  type ApiMiddlewareHandler,
  type ApiState,
  type ApiStore,
  type ApiStoreConfig
} from './types'

/** Abort-aware sleep that rejects early when the signal fires. */
const abortableSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Aborted'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
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
        // Already settled via abort — swallow the rejection so the orphaned
        // promise doesn't surface as an unhandled rejection.  The abort
        // error was already delivered through the `onAbort` path above.
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

/** Creates a combined AbortSignal that respects both a user signal and a timeout duration. */
const createTimeoutSignal = (
  timeout: number | undefined,
  userSignal: AbortSignal | undefined
): { signal: AbortSignal | undefined; cleanup: () => void; isTimedOut: () => boolean } => {
  if (timeout == null || timeout <= 0) {
    return { signal: userSignal, cleanup: () => {}, isTimedOut: () => false }
  }

  let timedOut = false
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)

  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort()
    } else {
      userSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
    isTimedOut: () => timedOut
  }
}

/** Normalizes an unknown thrown value into an ApiError with optional status/code. */
const normalizeError = (error: unknown): ApiError => {
  const apiError: ApiError = error instanceof Error ? error : new Error('An unknown error occurred')
  // Attach the original thrown value as `cause` so it's visible in stack traces
  // when the thrown value is not an Error instance (e.g. a string or plain object).
  if (!(error instanceof Error) && error !== undefined) {
    ;(apiError as Error & { cause?: unknown }).cause = error
  }
  if (error && typeof error === 'object' && 'status' in error) {
    apiError.status = error.status as number
  }
  if (error && typeof error === 'object' && 'code' in error) {
    apiError.code = error.code as string
  }
  return apiError
}

/** Creates an abort/timeout ApiError based on whether a timeout triggered the abort. */
const createAbortError = (timedOut: boolean): ApiError => {
  const error: ApiError = new Error(timedOut ? 'Request timed out' : 'Aborted')
  error.code = timedOut ? 'TIMEOUT' : 'ABORT_ERR'
  return error
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
  const {
    storageKey = STORAGE_KEY,
    storage: customStorage,
    enableDevtools = false,
    devtoolsName = storageKey
  } = config

  /** Per-store counter map for race-condition protection. */
  const activeRequests: Record<string, number> = {}

  /** Per-store in-flight promises for request deduplication. */
  const pendingRequests = new Map<string, Promise<unknown>>()

  /** Per-store abort controllers for cancellation. */
  const activeControllers = new Map<string, AbortController>()

  const storeCreator = immer<ApiStore>((set, get) => ({
    apiStates: {},
    persistentKeys: {},
    middleware: [],
    errorHandlers: [],

    setApiState: <T>(key: string, state: Partial<ApiState<T>>, shouldPersist?: boolean) =>
      set(draft => {
        if (!draft.apiStates[key]) {
          draft.apiStates[key] = { ...initialApiState } as ApiState<T>
        }

        const prevState = draft.apiStates[key] as ApiState<T>
        Object.assign(prevState, state)

        if (shouldPersist === true) {
          draft.persistentKeys[key] = true
        } else if (shouldPersist === false) {
          delete draft.persistentKeys[key]
        }
        // undefined = don't change persistence
      }),

    resetApiState: (key: string) => {
      delete activeRequests[key]
      pendingRequests.delete(key)
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

    invalidateApis: (keys: string[]) =>
      set(draft => {
        for (const key of keys) {
          if (draft.apiStates[key]) {
            draft.apiStates[key].fetchedAt = null
          }
        }
      }),

    resetApiStates: (keys: string[]) => {
      for (const key of keys) {
        delete activeRequests[key]
        pendingRequests.delete(key)
      }
      set(draft => {
        for (const key of keys) {
          delete draft.apiStates[key]
          delete draft.persistentKeys[key]
        }
      })
    },

    resetAll: () => {
      const keys = Object.keys(get().apiStates)
      for (const key of keys) {
        delete activeRequests[key]
        pendingRequests.delete(key)
      }
      set(draft => {
        draft.apiStates = {}
        draft.persistentKeys = {}
      })
    },

    invalidateAll: () =>
      set(draft => {
        for (const key of Object.keys(draft.apiStates)) {
          draft.apiStates[key].fetchedAt = null
        }
      }),

    handleApi: <T>(
      key: string,
      apiCall: () => Promise<T>,
      options: ApiCallOptions<T> = {}
    ): Promise<T | undefined> => {
      // Merge with global config
      const mergedOptions = mergeWithGlobalConfig(options)
      const { staleTime, dedupe, revalidateOnStale } = mergedOptions

      // Call onStart lifecycle hook
      mergedOptions.onStart?.()

      const existing = get().apiStates[key]
      const isFresh =
        existing?.status === FetchStatus.SUCCESS &&
        existing.fetchedAt != null &&
        staleTime != null &&
        staleTime > 0 &&
        Date.now() - existing.fetchedAt < staleTime

      // Cache hit: return fresh data without refetching
      if (isFresh) {
        // Call onCacheHit lifecycle hook
        mergedOptions.onCacheHit?.(existing.data as T)
        return Promise.resolve(existing.data as T)
      }

      // Stale-while-revalidate: return stale data immediately, refetch in background
      if (revalidateOnStale && existing?.status === FetchStatus.SUCCESS && existing.data != null) {
        // Return stale data immediately
        const staleData = existing.data as T
        // Trigger background revalidation (don't await)
        const backgroundOptions = {
          ...mergedOptions,
          revalidateOnStale: false // Prevent infinite loop
        }
        get().handleApi(key, apiCall, backgroundOptions)
        return Promise.resolve(staleData)
      }

      // Deduplication: return existing in-flight promise for this key
      if (dedupe) {
        const existing = pendingRequests.get(key)
        if (existing) return existing as Promise<T | undefined>
      }

      const promise = (async (): Promise<T | undefined> => {
        const { setApiState } = get()
        const globalConfig = getGlobalConfig()
        const { retry = 0, optimisticData } = mergedOptions

        // Create an internal controller for cancelAll support
        const internalController = new AbortController()
        activeControllers.set(key, internalController)

        // Combine user signal with internal controller and timeout
        const combinedSignal = mergedOptions.signal || internalController.signal
        const timeout = createTimeoutSignal(mergedOptions.timeout, combinedSignal)
        const effectiveSignal = timeout.signal

        // Listen for internal controller abort
        if (mergedOptions.signal) {
          mergedOptions.signal.addEventListener('abort', () => internalController.abort(), {
            once: true
          })
        }

        const effectiveOptions = { ...mergedOptions, signal: effectiveSignal }

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

        const onError = (error: ApiError) => {
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
          // Call global error handler
          globalConfig.onError?.(error, key)
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
              onError(createAbortError(timeout.isTimedOut()))
              return
            }

            try {
              const data = await raceWithSignal(apiCall(), opts.signal)
              if (isStale()) return
              setApiState(
                key,
                {
                  status: FetchStatus.SUCCESS,
                  data,
                  error: null,
                  fetchedAt: Date.now()
                },
                opts.persist
              )
              opts.onSuccess?.(data)
              // Call global success handler
              globalConfig.onSuccess?.(data, key)
              return
            } catch (error) {
              if (isStale()) return

              if (opts.signal?.aborted) {
                onError(createAbortError(timeout.isTimedOut()))
                return
              }

              const apiError = normalizeError(error)

              // Check shouldRetry predicate
              if (opts.shouldRetry && !opts.shouldRetry(apiError, attempt)) {
                onError(apiError)
                return
              }

              lastError = apiError

              if (attempt < maxAttempts - 1) {
                // Call onBeforeRetry lifecycle hook
                opts.onBeforeRetry?.(apiError, attempt)
                try {
                  await abortableSleep(backoffFn(attempt), opts.signal)
                } catch {
                  onError(createAbortError(timeout.isTimedOut()))
                  return
                }
              }
            }
          }

          if (lastError) {
            onError(lastError)
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
          timeout.cleanup()
          activeControllers.delete(key)
          effectiveOptions.onSettled?.()
          // Call global settled handler
          globalConfig.onSettled?.(key)
        }

        // Return the data if the request succeeded and wasn't superseded
        if (isStale()) return undefined

        // This request is the latest to complete — clean up the tracking
        // entry so long-running apps don't accumulate stale counters.
        delete activeRequests[key]

        const finalState = get().apiStates[key]
        if (finalState?.status === FetchStatus.SUCCESS) {
          return finalState.data as T
        }
        if (mergedOptions.throwOnError && finalState?.error) {
          throw finalState.error
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

    addMiddleware: middleware => {
      set(draft => {
        draft.middleware.push(middleware)
      })
      return () => {
        set(draft => {
          // indexOf works correctly here because immer's proxy resolves
          // the comparison against the original reference.
          const idx = draft.middleware.indexOf(middleware)
          if (idx !== -1) draft.middleware.splice(idx, 1)
        })
      }
    },

    addErrorHandler: handler => {
      set(draft => {
        draft.errorHandlers.push(handler)
      })
      return () => {
        set(draft => {
          const idx = draft.errorHandlers.indexOf(handler)
          if (idx !== -1) draft.errorHandlers.splice(idx, 1)
        })
      }
    },

    cancelAll: () => {
      // Abort all tracked controllers
      activeControllers.forEach(controller => controller.abort())
      activeControllers.clear()
    },

    cancelRequest: (key: string) => {
      const controller = activeControllers.get(key)
      if (controller) {
        controller.abort()
        activeControllers.delete(key)
      }
    }
  }))

  const persistedStore = persist(storeCreator, {
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
  })

  const useStore: UseBoundStore<StoreApi<ApiStore>> = create<ApiStore>()(
    enableDevtools
      ? (devtools(persistedStore, {
          name: devtoolsName,
          enabled: process.env.NODE_ENV !== 'production'
        }) as any)
      : persistedStore
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
