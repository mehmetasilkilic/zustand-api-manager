import { useCallback, useEffect, useRef, useState } from 'react'
import { useApiStore } from './store'
import { getGlobalConfig } from './config'
import { onWindowFocus, onReconnect } from './focusManager'
import {
  ApiCallOptions,
  ApiComposerConfig,
  ApiComposerReturn,
  ApiQueryEndpoint,
  ApiState,
  ApiStore,
  ComposerDeclarativeOptions,
  FetchStatus,
  InfiniteData,
  MutationEndpointConfig
} from './types'
import { compositeKey } from './utils'
import type { StoreApi, UseBoundStore } from 'zustand'

/** Default GC time: 5 minutes (matches React Query). */
const DEFAULT_GC_TIME = 300_000

/** Keys excluded when forwarding declarative options to ApiCallOptions. */
const DECLARATIVE_ONLY_KEYS = new Set([
  'params', 'enabled', 'signal', 'optimisticData', 'polling',
  'refetchOnWindowFocus', 'refetchOnReconnect', 'gcTime'
])

/** Extract ApiCallOptions from a declarative options record. */
function extractApiOptions(opts: Record<string, unknown> | undefined): ApiCallOptions<unknown> {
  if (!opts) return {}
  const apiOptions: Record<string, unknown> = {}
  for (const k of Object.keys(opts)) {
    if (!DECLARATIVE_ONLY_KEYS.has(k)) {
      apiOptions[k] = opts[k]
    }
  }
  return apiOptions as ApiCallOptions<unknown>
}

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

  // Detect void-param infinite queries
  const voidInfiniteQueryKeys = new Set<string>()
  if (config?.infiniteQueries) {
    for (const [k, iq] of Object.entries(config.infiniteQueries)) {
      if (iq != null && (iq as { queryFn: (...a: unknown[]) => unknown }).queryFn.length <= 1) {
        voidInfiniteQueryKeys.add(k)
      }
    }
  }

  // ── Active query tracking (shared across all hook instances) ──

  // key = composite cache key (e.g. "getUser::{"id":1}")
  // value = { endpoint, params, gcTime, refetchFn }
  const activeQueries = new Map<string, {
    endpoint: string
    params: unknown
    gcTime: number
    refetchFn?: () => Promise<unknown>
  }>()

  // key = bare endpoint name, value = set of active composite keys
  const activeKeysByEndpoint = new Map<string, Set<string>>()

  // ── Garbage collection timers ──
  const gcTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function registerActiveQuery(
    endpoint: string,
    cacheKey: string,
    params: unknown,
    gcTime: number,
    refetchFn?: () => Promise<unknown>
  ) {
    // Cancel any pending GC timer (query re-mounted before GC fired)
    const existingTimer = gcTimers.get(cacheKey)
    if (existingTimer != null) {
      clearTimeout(existingTimer)
      gcTimers.delete(cacheKey)
    }

    activeQueries.set(cacheKey, { endpoint, params, gcTime, refetchFn })
    let keys = activeKeysByEndpoint.get(endpoint)
    if (!keys) {
      keys = new Set()
      activeKeysByEndpoint.set(endpoint, keys)
    }
    keys.add(cacheKey)
  }

  function unregisterActiveQuery(endpoint: string, cacheKey: string) {
    const entry = activeQueries.get(cacheKey)
    activeQueries.delete(cacheKey)
    const keys = activeKeysByEndpoint.get(endpoint)
    if (keys) {
      keys.delete(cacheKey)
      if (keys.size === 0) activeKeysByEndpoint.delete(endpoint)
    }

    // Start GC timer if applicable
    const gcTime = entry?.gcTime ?? DEFAULT_GC_TIME
    if (gcTime > 0 && gcTime !== Infinity) {
      const store = config?.store ?? useApiStore
      const timer = setTimeout(() => {
        gcTimers.delete(cacheKey)
        store.getState().resetApiState(cacheKey)
      }, gcTime)
      gcTimers.set(cacheKey, timer)
    }
  }

  /** Resolve the effective gcTime for a declarative options object. */
  function resolveGcTime(opts: Record<string, unknown> | undefined): number {
    const local = opts?.gcTime as number | undefined
    if (local != null) return local
    const global = getGlobalConfig().defaultGcTime
    if (global != null) return global
    return DEFAULT_GC_TIME
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

    // Check if this is an infinite query
    const infiniteConfig = config?.infiniteQueries?.[key] as
      | { queryFn: (params: unknown, cursor: unknown) => Promise<unknown>; getNextCursor: (lastPage: unknown) => unknown; initialCursor?: unknown }
      | undefined

    const infiniteConfigRef = useRef(infiniteConfig)
    infiniteConfigRef.current = infiniteConfig

    const isInfiniteQuery = infiniteConfig != null

    // Declarative mode detection: second arg provided AND this is a query/infinite endpoint (not mutation)
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

    // Track isFetchingNextPage for infinite queries
    const [isFetchingNextPage, setIsFetchingNextPage] = useState(false)

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
                      if (active?.refetchFn) {
                        // Use stored refetchFn (handles both regular and infinite queries)
                        active.refetchFn()
                      } else {
                        const boundFn = config?.queries?.[endpoint as keyof TApiStructure] as
                          | ((params: unknown) => Promise<unknown>)
                          | undefined
                        if (active && boundFn) {
                          store.handleApi(ck, () => boundFn(active.params))
                        }
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

    // ── Infinite query endpoint ──
    if (isInfiniteQuery) {
      const infiniteData = (apiState?.data ?? null) as InfiniteData<unknown, unknown> | null

      const reset = useCallback(
        () => useStore.getState().resetApiState(subscriptionKey),
        [subscriptionKey, useStore]
      )

      const invalidate = useCallback(
        () => useStore.getState().invalidateApi(subscriptionKey),
        [subscriptionKey, useStore]
      )

      const fetchNextPage = useCallback(
        (options?: ApiCallOptions<unknown>) => {
          const cfg = infiniteConfigRef.current!
          const store = useStore.getState()
          const currentData = store.apiStates[subscriptionKey]?.data as InfiniteData<unknown, unknown> | null
          const lastPage = currentData?.pages[currentData.pages.length - 1]
          const nextCursor = lastPage ? cfg.getNextCursor(lastPage) : cfg.initialCursor

          setIsFetchingNextPage(true)
          return store.handleApi(subscriptionKey, async () => {
            const page = await cfg.queryFn(declParams, nextCursor)
            const prevData = useStore.getState().apiStates[subscriptionKey]?.data as InfiniteData<unknown, unknown> | null
            return {
              pages: [...(prevData?.pages ?? []), page],
              pageParams: [...(prevData?.pageParams ?? []), nextCursor]
            }
          }, {
            ...options,
            onSuccess: (data: unknown) => {
              setIsFetchingNextPage(false)
              options?.onSuccess?.(data)
            },
            onError: (error) => {
              setIsFetchingNextPage(false)
              options?.onError?.(error)
            }
          }) as Promise<InfiniteData<unknown, unknown> | undefined>
        },
        [subscriptionKey, useStore, declParams]
      )

      // Compute hasNextPage
      const lastPage = infiniteData?.pages[infiniteData.pages.length - 1]
      const hasNextPage = lastPage != null
        ? infiniteConfigRef.current!.getNextCursor(lastPage) != null
        : false

      // Declarative auto-fetch effect for infinite query endpoints
      useEffect(() => {
        if (!isDeclarativeMode || !enabled || !infiniteConfigRef.current) return

        const params = declParams
        const cacheKey = compositeKey(key as string, params)
        const cfg = infiniteConfigRef.current!
        const opts = declarativeOptionsRef.current as Record<string, unknown> | undefined
        const gcTime = resolveGcTime(opts)

        // Create the initial fetch function (fetches first page)
        const initialFetch = () =>
          useStore.getState().handleApi(cacheKey, async () => {
            const page = await cfg.queryFn(params, cfg.initialCursor)
            return { pages: [page], pageParams: [cfg.initialCursor] } as InfiniteData<unknown, unknown>
          })

        registerActiveQuery(key as string, cacheKey, params, gcTime, initialFetch)

        // Trigger initial fetch
        initialFetch()

        // Focus/reconnect subscriptions
        const cleanups: (() => void)[] = []
        const globalCfg = getGlobalConfig()
        const refetchOnFocus = (opts?.refetchOnWindowFocus as boolean | undefined) ?? globalCfg.defaultRefetchOnWindowFocus
        const refetchOnReconnectOpt = (opts?.refetchOnReconnect as boolean | undefined) ?? globalCfg.defaultRefetchOnReconnect

        if (refetchOnFocus) {
          cleanups.push(onWindowFocus(() => initialFetch()))
        }
        if (refetchOnReconnectOpt) {
          cleanups.push(onReconnect(() => initialFetch()))
        }

        return () => {
          unregisterActiveQuery(key as string, cacheKey)
          cleanups.forEach(fn => fn())
        }
      }, [key, serializedParams, enabled, isDeclarativeMode, useStore])

      return {
        pages: infiniteData?.pages ?? [],
        pageParams: infiniteData?.pageParams ?? [],
        status: commonState.status,
        isFetching: commonState.isFetching,
        isLoading: commonState.isLoading,
        isFetchingNextPage,
        hasNextPage,
        isSuccess: commonState.isSuccess,
        isError: commonState.isError,
        error: commonState.error,
        fetchedAt: apiState?.fetchedAt ?? null,
        fetchNextPage,
        reset,
        invalidate
      } as ApiComposerReturn<TApiStructure, K>
    }

    // ── Regular query endpoint ──
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
      const opts = declarativeOptionsRef.current as Record<string, unknown> | undefined
      const gcTime = resolveGcTime(opts)
      const apiOptions = extractApiOptions(opts)

      // Create refetch function for invalidation
      const refetch = () =>
        useStore.getState().handleApi(cacheKey, () => queryFnRef.current!(params), apiOptions)

      // Register in active queries for invalidation refetch
      registerActiveQuery(key as string, cacheKey, params, gcTime, refetch)

      // Trigger initial fetch
      refetch()

      // Focus/reconnect subscriptions
      const cleanups: (() => void)[] = []
      const globalCfg = getGlobalConfig()
      const refetchOnFocus = (opts?.refetchOnWindowFocus as boolean | undefined) ?? globalCfg.defaultRefetchOnWindowFocus
      const refetchOnReconnectOpt = (opts?.refetchOnReconnect as boolean | undefined) ?? globalCfg.defaultRefetchOnReconnect

      if (refetchOnFocus) {
        cleanups.push(onWindowFocus(() => {
          const currentOpts = declarativeOptionsRef.current as Record<string, unknown> | undefined
          const currentParams = (currentOpts as { params?: unknown } | undefined)?.params
          const currentCacheKey = compositeKey(key as string, currentParams)
          const currentApiOptions = extractApiOptions(currentOpts)
          useStore.getState().handleApi(currentCacheKey, () => queryFnRef.current!(currentParams), currentApiOptions)
        }))
      }
      if (refetchOnReconnectOpt) {
        cleanups.push(onReconnect(() => {
          const currentOpts = declarativeOptionsRef.current as Record<string, unknown> | undefined
          const currentParams = (currentOpts as { params?: unknown } | undefined)?.params
          const currentCacheKey = compositeKey(key as string, currentParams)
          const currentApiOptions = extractApiOptions(currentOpts)
          useStore.getState().handleApi(currentCacheKey, () => queryFnRef.current!(currentParams), currentApiOptions)
        }))
      }

      // Polling support
      const pollingInterval = (declarativeOptionsRef.current as { polling?: number } | undefined)?.polling

      if (pollingInterval && pollingInterval > 0) {
        const tick = () => {
          const currentState = useStore.getState().apiStates[cacheKey]
          if (currentState?.status === FetchStatus.LOADING) return // skip if still loading

          const currentOpts = declarativeOptionsRef.current as Record<string, unknown> | undefined
          const pollApiOptions = extractApiOptions(currentOpts)

          const currentParams = (currentOpts as { params?: unknown } | undefined)?.params
          const currentCacheKey = compositeKey(key as string, currentParams)
          useStore.getState().handleApi(currentCacheKey, () => queryFnRef.current!(currentParams), pollApiOptions)
        }

        const intervalId = setInterval(tick, pollingInterval)
        return () => {
          unregisterActiveQuery(key as string, cacheKey)
          clearInterval(intervalId)
          cleanups.forEach(fn => fn())
        }
      }

      // Cleanup: deregister from active queries
      return () => {
        unregisterActiveQuery(key as string, cacheKey)
        cleanups.forEach(fn => fn())
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
