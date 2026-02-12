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
          // Clean up race-condition counter to prevent memory leak
          delete activeRequests[key]
          set(draft => {
            delete draft.apiStates[key]
            delete draft.persistentKeys[key]
          })
        },

        handleApi: async <T>(
          key: string,
          apiCall: () => Promise<{ data: T }>,
          options: ApiCallOptions<T> = {}
        ): Promise<T | undefined> => {
          const { setApiState } = get()
          const { retry = 0, staleTime, optimisticData } = options

          // Cache / staleTime: skip fetch if data is fresh enough
          if (staleTime != null && staleTime > 0) {
            const existing = get().apiStates[key]
            if (
              existing?.status === FetchStatus.SUCCESS &&
              existing.fetchedAt != null &&
              Date.now() - existing.fetchedAt < staleTime
            ) {
              return existing.data as T
            }
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
              options.persist
            )
          }

          const handleError = (error: ApiError) => {
            if (isStale()) return
            // Roll back to previous data when optimistic update was used
            const rollbackData = optimisticData !== undefined ? previousData : null
            setApiState<T>(
              key,
              { status: FetchStatus.ERROR, error, data: rollbackData as T | null },
              options.persist
            )
            // Read errorHandlers fresh to avoid stale closure references
            get().errorHandlers.forEach(handler => handler(error, key))
            options.onError?.(error)
          }

          const baseHandler: ApiMiddlewareHandler = async (key, apiCall, options) => {
            if (isStale()) return

            // Only set LOADING if we didn't already set it via optimistic update
            if (optimisticData === undefined) {
              setApiState(key, { status: FetchStatus.LOADING }, options.persist)
            }

            let lastError: ApiError | undefined
            const maxAttempts = (options.retry ?? 0) + 1

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              if (options.signal?.aborted) {
                const abortError: ApiError = new Error('Aborted')
                abortError.code = 'ABORT_ERR'
                handleError(abortError)
                return
              }

              try {
                const response = await apiCall()
                if (isStale()) return
                setApiState(
                  key,
                  {
                    status: FetchStatus.SUCCESS,
                    data: response.data,
                    error: null,
                    fetchedAt: Date.now()
                  },
                  options.persist
                )
                options.onSuccess?.(response.data)
                return
              } catch (error) {
                if (isStale()) return

                if (options.signal?.aborted) {
                  const abortError: ApiError = new Error('Aborted')
                  abortError.code = 'ABORT_ERR'
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
                lastError = apiError

                if (attempt < maxAttempts - 1) {
                  try {
                    await abortableSleep(Math.min(1000 * 2 ** attempt, 10000), options.signal)
                  } catch {
                    // Sleep was aborted — treat as abort error
                    const abortError: ApiError = new Error('Aborted')
                    abortError.code = 'ABORT_ERR'
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

          await composedHandler(key, apiCall, { ...options, retry })

          // Return the data if the request succeeded and wasn't superseded
          if (isStale()) return undefined
          const finalState = get().apiStates[key]
          if (finalState?.status === FetchStatus.SUCCESS) {
            return finalState.data as T
          }
          return undefined
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
