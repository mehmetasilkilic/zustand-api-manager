import { useCallback, useEffect, useRef, useState } from 'react'
import { useApiStore } from './store'
import {
  ApiCallOptions,
  ApiComposerConfig,
  ApiComposerReturn,
  ApiQueryEndpoint,
  ApiState,
  ApiStore,
  ComposerDeclarativeOptions,
  FetchStatus,
  MutationEndpointConfig
} from './types'
import { compositeKey } from './utils'
import type { StoreApi, UseBoundStore } from 'zustand'

/** Internal normalized shape for every mutation endpoint. */
interface NormalizedMutation {
  fn: (variables: unknown) => Promise<unknown>
  invalidates: string[]
  optimistic: Record<string, (variables: unknown, currentData: unknown) => unknown>
}

/** Normalize a bare function or MutationEndpointConfig into a consistent shape. */
function normalizeMutation(
  entry: ((variables: unknown) => Promise<unknown>) | MutationEndpointConfig<any, any, any>
): NormalizedMutation {
  if (typeof entry === 'function') {
    return { fn: entry, invalidates: [], optimistic: {} }
  }
  return {
    fn: entry.fn as (variables: unknown) => Promise<unknown>,
    invalidates: (entry.invalidates ?? []) as string[],
    optimistic: (entry.optimistic ?? {}) as Record<
      string,
      (variables: unknown, currentData: unknown) => unknown
    >
  }
}

/**
 * Creates a fully type-safe API hook factory based on a predefined API structure.
 *
 * Define your API structure as an interface mapping endpoint keys to
 * {@link ApiQueryEndpoint} or {@link ApiMutationEndpoint} types. The returned
 * hook automatically infers parameter and response types for each endpoint.
 *
 * For queries, bind the query function in the `queries` config and call `query(params, options?)`
 * or `query(options?)` for void-param endpoints.
 *
 * For mutations, bind the mutation function in the `mutations` config and call `mutate(variables, options?)`.
 * Mutations support automatic cache invalidation via `invalidates` and cross-endpoint optimistic
 * updates via `optimistic` when using the config object form.
 *
 * @typeParam TApiStructure - An interface where each key maps to an endpoint type.
 * @param config - Optional configuration including query/mutation functions and custom store.
 * @returns A hook that accepts an endpoint key and returns the appropriate result type.
 *
 * @example
 * ```tsx
 * import { createApiComposer, ApiQueryEndpoint, ApiMutationEndpoint } from 'zustand-api-manager'
 *
 * interface MyApi {
 *   getUser: ApiQueryEndpoint<{ id: number }, User>
 *   listUsers: ApiQueryEndpoint<void, User[]>
 *   createUser: ApiMutationEndpoint<CreateUserPayload, User>
 * }
 *
 * const useApi = createApiComposer<MyApi>({
 *   queries: {
 *     getUser: (params) => api.getUser(params),
 *     listUsers: () => api.listUsers()
 *   },
 *   mutations: {
 *     createUser: {
 *       fn: (payload) => api.createUser(payload),
 *       invalidates: ['listUsers'],
 *       optimistic: {
 *         listUsers: (vars, current) => [...(current ?? []), { id: Date.now(), ...vars }]
 *       }
 *     }
 *   }
 * })
 * ```
 */
export function createApiComposer<TApiStructure>(
  config?: ApiComposerConfig<TApiStructure> & { store?: UseBoundStore<StoreApi<ApiStore>> }
) {
  // ── Normalization layer (runs once at creation time, not per-render) ──

  const normalizedMutations = new Map<string, NormalizedMutation>()
  if (config?.mutations) {
    for (const [k, entry] of Object.entries(config.mutations)) {
      if (entry != null) {
        normalizedMutations.set(k, normalizeMutation(entry as any))
      }
    }
  }

  // ── Void-param detection via fn.length (replaces arg sniffing) ──

  const voidQueryKeys = new Set<string>()
  if (config?.queries) {
    for (const [k, fn] of Object.entries(config.queries)) {
      if (fn != null && (fn as (...a: unknown[]) => unknown).length === 0) voidQueryKeys.add(k)
    }
  }

  const voidMutationKeys = new Set<string>()
  for (const [k, norm] of normalizedMutations) {
    if (norm.fn.length === 0) voidMutationKeys.add(k)
  }

  // ── Active query tracking (shared across all hook instances) ──

  // key = composite cache key (e.g. "getUser::{"id":1}")
  // value = { endpoint: "getUser", params: { id: 1 } }
  const activeQueries = new Map<string, { endpoint: string; params: unknown }>()

  // key = bare endpoint name, value = set of active composite keys
  const activeKeysByEndpoint = new Map<string, Set<string>>()

  function registerActiveQuery(endpoint: string, cacheKey: string, params: unknown) {
    activeQueries.set(cacheKey, { endpoint, params })
    let keys = activeKeysByEndpoint.get(endpoint)
    if (!keys) {
      keys = new Set()
      activeKeysByEndpoint.set(endpoint, keys)
    }
    keys.add(cacheKey)
  }

  function unregisterActiveQuery(endpoint: string, cacheKey: string) {
    activeQueries.delete(cacheKey)
    const keys = activeKeysByEndpoint.get(endpoint)
    if (keys) {
      keys.delete(cacheKey)
      if (keys.size === 0) activeKeysByEndpoint.delete(endpoint)
    }
  }

  // ── Prefetch type: extracts params from query endpoints ──

  type PrefetchParams<K extends keyof TApiStructure> =
    TApiStructure[K] extends ApiQueryEndpoint<infer P, any>
      ? P extends void ? [] : [params: P]
      : never

  type PrefetchFn = <K extends keyof TApiStructure & string>(
    key: K,
    ...args: [...PrefetchParams<K>, options?: Omit<ApiCallOptions<unknown>, 'onSuccess' | 'onError' | 'onSettled'>]
  ) => Promise<unknown>

  function useApiComposer<K extends keyof TApiStructure>(
    key: K,
    declarativeOptions?: ComposerDeclarativeOptions<TApiStructure, K>
  ): ApiComposerReturn<TApiStructure, K> {
    const useStore = config?.store ?? useApiStore

    // Check if this is a mutation with a pre-bound function
    const normalizedMutation = normalizedMutations.get(key as string)
    const mutationFn = normalizedMutation?.fn
    const mutationFnRef = useRef(mutationFn)
    mutationFnRef.current = mutationFn

    // Check if this is a query with a pre-bound function
    const queryFn = config?.queries?.[key] as
      | ((params: unknown) => Promise<unknown>)
      | undefined

    const queryFnRef = useRef(queryFn)
    queryFnRef.current = queryFn

    // Declarative mode detection: second arg provided AND this is a query endpoint (not mutation)
    const isDeclarativeMode = declarativeOptions != null && !mutationFn
    const declParams = isDeclarativeMode
      ? (declarativeOptions as { params?: unknown }).params
      : undefined

    // For declarative mode, compute the composite key for subscriptions
    const declCacheKey = isDeclarativeMode
      ? compositeKey(key as string, declParams)
      : undefined

    const serializedParams = isDeclarativeMode ? JSON.stringify(declParams) : ''
    const enabled = isDeclarativeMode
      ? (declarativeOptions as { enabled?: boolean }).enabled !== false
      : false

    // Keep declarative options in ref so the effect uses latest without restarting
    const declarativeOptionsRef = useRef(declarativeOptions)
    declarativeOptionsRef.current = declarativeOptions

    // Imperative mode: track which cache key we're subscribed to
    const [activeCacheKey, setActiveCacheKey] = useState<string>(
      declCacheKey ?? (key as string)
    )

    // When declarative cache key changes, sync the active key
    const prevDeclCacheKeyRef = useRef(declCacheKey)
    if (declCacheKey != null && declCacheKey !== prevDeclCacheKeyRef.current) {
      prevDeclCacheKeyRef.current = declCacheKey
      if (activeCacheKey !== declCacheKey) {
        setActiveCacheKey(declCacheKey)
      }
    }

    // The effective key to subscribe to in the store
    const subscriptionKey = isDeclarativeMode ? (declCacheKey ?? (key as string)) : activeCacheKey

    // Subscribe reactively to the state slice using the composite key
    const apiState = useStore(state => state.apiStates[subscriptionKey]) as
      | ApiState<unknown>
      | undefined

    // Common state accessors
    const commonState = {
      data: apiState?.data ?? null,
      status: (apiState?.status ?? FetchStatus.IDLE) as FetchStatus,
      isIdle: !apiState || apiState.status === FetchStatus.IDLE,
      isFetching: apiState?.status === FetchStatus.LOADING,
      isLoading: apiState?.status === FetchStatus.LOADING && (apiState?.data ?? null) === null,
      isSuccess: apiState?.status === FetchStatus.SUCCESS,
      isError: apiState?.status === FetchStatus.ERROR,
      error: apiState?.error ?? null
    }

    // If this is a mutation endpoint
    if (normalizedMutation) {
      const mutate = useCallback(
        (...args: unknown[]) => {
          let variables: unknown
          let options: ApiCallOptions<unknown> | undefined

          if (voidMutationKeys.has(key as string)) {
            // void: mutate(options?)
            variables = undefined
            options = args[0] as ApiCallOptions<unknown> | undefined
          } else {
            // params: mutate(variables, options?)
            variables = args[0]
            options = args[1] as ApiCallOptions<unknown> | undefined
          }

          const store = useStore.getState()
          const norm = normalizedMutations.get(key as string)!
          const { invalidates, optimistic } = norm

          // ── Cross-endpoint optimistic updates (broadcast to composite keys) ──
          const snapshots = new Map<string, unknown>()
          const optimisticKeys = Object.keys(optimistic)

          if (optimisticKeys.length > 0) {
            for (const qKey of optimisticKeys) {
              const updater = optimistic[qKey]
              if (!updater) continue

              // Apply to all active composite keys for this endpoint
              const compositeKeys = activeKeysByEndpoint.get(qKey)
              if (compositeKeys) {
                for (const ck of compositeKeys) {
                  const currentState = store.apiStates[ck]
                  const currentData = currentState?.data ?? null
                  snapshots.set(ck, currentData)
                  const newData = updater(variables, currentData)
                  store.setApiState(ck, { data: newData })
                }
              } else {
                // Fallback: try bare key
                const currentState = store.apiStates[qKey]
                const currentData = currentState?.data ?? null
                snapshots.set(qKey, currentData)
                const newData = updater(variables, currentData)
                store.setApiState(qKey, { data: newData })
              }
            }
          }

          // ── Execute the mutation via handleApi ──
          const userOnSuccess = options?.onSuccess
          const userOnError = options?.onError

          const wrappedOptions: ApiCallOptions<unknown> = {
            ...options,
            onSuccess: (data: unknown) => {
              // Invalidation — broadcast to all composite keys
              if (invalidates.length > 0) {
                const keysToInvalidate: string[] = [...invalidates]

                for (const endpoint of invalidates) {
                  const composites = activeKeysByEndpoint.get(endpoint)
                  if (composites) {
                    keysToInvalidate.push(...composites)

                    // Refetch each active composite key
                    for (const ck of composites) {
                      const active = activeQueries.get(ck)
                      const boundFn = config?.queries?.[endpoint as keyof TApiStructure] as
                        | ((params: unknown) => Promise<unknown>)
                        | undefined
                      if (active && boundFn) {
                        store.handleApi(ck, () => boundFn(active.params))
                      }
                    }
                  }
                }

                store.invalidateApis(keysToInvalidate)
              }

              userOnSuccess?.(data)
            },
            onError: (error) => {
              // Rollback optimistic snapshots (using composite keys)
              if (snapshots.size > 0) {
                for (const [ck, previousData] of snapshots) {
                  store.setApiState(ck, { data: previousData })
                }
              }

              userOnError?.(error)
            }
          }

          return store.handleApi(
            key as string,
            () => mutationFnRef.current!(variables),
            wrappedOptions
          )
        },
        [key, useStore]
      )

      const reset = useCallback(
        () => useStore.getState().resetApiState(key as string),
        [key, useStore]
      )

      return {
        ...commonState,
        mutate,
        reset
      } as ApiComposerReturn<TApiStructure, K>
    }

    // This is a query endpoint — requires a bound query function
    const query = useCallback(
      (...args: unknown[]) => {
        let params: unknown
        let options: ApiCallOptions<unknown> | undefined

        if (voidQueryKeys.has(key as string)) {
          // void: query(options?)
          params = undefined
          options = args[0] as ApiCallOptions<unknown> | undefined
        } else {
          // params: query(params, options?)
          params = args[0]
          options = args[1] as ApiCallOptions<unknown> | undefined
        }

        const cacheKey = compositeKey(key as string, params)
        setActiveCacheKey(cacheKey) // triggers re-subscription

        return useStore
          .getState()
          .handleApi(cacheKey, () => queryFnRef.current!(params), options)
      },
      [key, useStore]
    )

    const reset = useCallback(
      () => useStore.getState().resetApiState(subscriptionKey),
      [subscriptionKey, useStore]
    )

    const invalidate = useCallback(
      () => useStore.getState().invalidateApi(subscriptionKey),
      [subscriptionKey, useStore]
    )

    // Declarative auto-fetch effect for query endpoints
    useEffect(() => {
      if (!isDeclarativeMode || !enabled || !queryFnRef.current) return

      const params = declParams
      const cacheKey = compositeKey(key as string, params)

      // Register in active queries for invalidation refetch
      registerActiveQuery(key as string, cacheKey, params)

      const opts = declarativeOptionsRef.current as Record<string, unknown> | undefined
      const apiOptions: ApiCallOptions<unknown> = {}
      if (opts) {
        // Forward ApiCallOptions keys, excluding declarative-only keys
        for (const k of Object.keys(opts)) {
          if (k !== 'params' && k !== 'enabled' && k !== 'signal' && k !== 'optimisticData' && k !== 'polling') {
            ;(apiOptions as Record<string, unknown>)[k] = opts[k]
          }
        }
      }

      useStore
        .getState()
        .handleApi(cacheKey, () => queryFnRef.current!(params), apiOptions)

      // Polling support
      const pollingInterval = (declarativeOptionsRef.current as { polling?: number } | undefined)?.polling

      if (pollingInterval && pollingInterval > 0) {
        const tick = () => {
          const currentState = useStore.getState().apiStates[cacheKey]
          if (currentState?.status === FetchStatus.LOADING) return // skip if still loading

          const currentOpts = declarativeOptionsRef.current as Record<string, unknown> | undefined
          const pollApiOptions: ApiCallOptions<unknown> = {}
          if (currentOpts) {
            for (const k of Object.keys(currentOpts)) {
              if (k !== 'params' && k !== 'enabled' && k !== 'signal' && k !== 'optimisticData' && k !== 'polling') {
                ;(pollApiOptions as Record<string, unknown>)[k] = currentOpts[k]
              }
            }
          }

          const currentParams = (currentOpts as { params?: unknown } | undefined)?.params
          const currentCacheKey = compositeKey(key as string, currentParams)
          useStore.getState().handleApi(currentCacheKey, () => queryFnRef.current!(currentParams), pollApiOptions)
        }

        const intervalId = setInterval(tick, pollingInterval)
        return () => {
          unregisterActiveQuery(key as string, cacheKey)
          clearInterval(intervalId)
        }
      }

      // Cleanup: deregister from active queries
      return () => {
        unregisterActiveQuery(key as string, cacheKey)
      }
    }, [key, serializedParams, enabled, isDeclarativeMode, useStore])

    return {
      ...commonState,
      fetchedAt: apiState?.fetchedAt ?? null,
      query,
      reset,
      invalidate
    } as ApiComposerReturn<TApiStructure, K>
  }

  // ── Static prefetch method ──

  const prefetch: PrefetchFn = (key, ...args) => {
    const store = config?.store ?? useApiStore
    const queryFn = config?.queries?.[key] as
      | ((params: unknown) => Promise<unknown>)
      | undefined
    if (!queryFn) return Promise.resolve(undefined)

    let params: unknown
    let options: Omit<ApiCallOptions<unknown>, 'onSuccess' | 'onError' | 'onSettled'> | undefined

    if (voidQueryKeys.has(key)) {
      // void: prefetch(key, options?)
      params = undefined
      options = args[0] as typeof options
    } else if (args.length <= 1) {
      // params only: prefetch(key, params)
      params = args[0]
    } else {
      // params + options: prefetch(key, params, options)
      params = args[0]
      options = args[1] as typeof options
    }

    const cacheKey = compositeKey(key, params)

    return store.getState().handleApi(cacheKey, () => queryFn(params), {
      ...options,
      onSuccess: undefined,
      onError: undefined,
      onSettled: undefined
    })
  }

  useApiComposer.prefetch = prefetch

  return useApiComposer as typeof useApiComposer & { prefetch: PrefetchFn }
}
