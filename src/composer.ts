import { useCallback, useRef, useState } from 'react'
import { useApiStore } from './store'
import { useLoadingStates as useLoadingStatesFn } from './hooks'
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
import { QueryTracker } from './queryTracker'
import { normalizeMutation, executeMutation, type NormalizedMutation } from './mutationHandler'
import { useDeclarativeEffect, extractApiOptions } from './useDeclarativeEffect'
import type { StoreApi, UseBoundStore } from 'zustand'

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
        normalizedMutations.set(k, normalizeMutation(
          entry as ((variables: unknown) => Promise<unknown>) | MutationEndpointConfig<TApiStructure, unknown, unknown>
        ))
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

  const tracker = new QueryTracker((cacheKey) => {
    const store = config?.store ?? useApiStore
    store.getState().resetApiState(cacheKey)
  })

  // Build a queries lookup for executeMutation (avoids leaking generic TApiStructure)
  const queriesLookup = config?.queries
    ? Object.fromEntries(
        Object.entries(config.queries)
          .filter(([, fn]) => fn != null)
          .map(([k, fn]) => [k, fn as (params: unknown) => Promise<unknown>])
      )
    : undefined

  // ── Prefetch type: extracts params from query endpoints ──

  type PrefetchParams<K extends keyof TApiStructure> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const [imperativeCacheKey, setImperativeCacheKey] = useState<string | null>(null)

    // The effective key to subscribe to in the store
    const subscriptionKey = isDeclarativeMode
      ? (declCacheKey ?? (key as string))
      : (imperativeCacheKey ?? (key as string))

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
            variables = undefined
            options = args[0] as ApiCallOptions<unknown> | undefined
          } else {
            variables = args[0]
            options = args[1] as ApiCallOptions<unknown> | undefined
          }

          return executeMutation(useStore, key as string, variables, options, mutationFnRef, normalizedMutation, tracker, queriesLookup)
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
      useDeclarativeEffect({
        key: key as string,
        params: declParams,
        serializedParams,
        enabled,
        isDeclarativeMode,
        useStore,
        tracker,
        declarativeOptionsRef,
        guard: () => !!infiniteConfigRef.current,
        makeFetchFn: (cacheKey, params) => {
          const cfg = infiniteConfigRef.current!
          return () =>
            useStore.getState().handleApi(cacheKey, async () => {
              const page = await cfg.queryFn(params, cfg.initialCursor)
              return { pages: [page], pageParams: [cfg.initialCursor] } as InfiniteData<unknown, unknown>
            })
        }
      })

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
        setImperativeCacheKey(cacheKey) // triggers re-subscription

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
    useDeclarativeEffect({
      key: key as string,
      params: declParams,
      serializedParams,
      enabled,
      isDeclarativeMode,
      useStore,
      tracker,
      declarativeOptionsRef,
      guard: () => !!queryFnRef.current,
      makeFetchFn: (cacheKey, params) => {
        const opts = declarativeOptionsRef.current as Record<string, unknown> | undefined
        const apiOptions = extractApiOptions(opts)
        return () =>
          useStore.getState().handleApi(cacheKey, () => queryFnRef.current!(params), apiOptions)
      },
      makeRefetchFn: (key) => () => {
        const currentOpts = declarativeOptionsRef.current as Record<string, unknown> | undefined
        const currentParams = (currentOpts as { params?: unknown } | undefined)?.params
        const currentCacheKey = compositeKey(key, currentParams)
        const currentApiOptions = extractApiOptions(currentOpts)
        useStore.getState().handleApi(currentCacheKey, () => queryFnRef.current!(currentParams), currentApiOptions)
      },
      makePollingTickFn: (cacheKey) => () => {
        const currentState = useStore.getState().apiStates[cacheKey]
        if (currentState?.status === FetchStatus.LOADING) return

        const currentOpts = declarativeOptionsRef.current as Record<string, unknown> | undefined
        const pollApiOptions = extractApiOptions(currentOpts)

        const currentParams = (currentOpts as { params?: unknown } | undefined)?.params
        const currentCacheKey = compositeKey(key as string, currentParams)
        useStore.getState().handleApi(currentCacheKey, () => queryFnRef.current!(currentParams), pollApiOptions)
      }
    })

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

  // ── Static useLoadingStates method ──

  type UseLoadingStatesFn = {
    (keys?: undefined): boolean
    (keys: (keyof TApiStructure & string) | (keyof TApiStructure & string)[]): boolean
  }

  const useLoadingStates: UseLoadingStatesFn = (
    keys?: (keyof TApiStructure & string) | (keyof TApiStructure & string)[]
  ): boolean => {
    const store = config?.store ?? useApiStore
    if (keys === undefined) return useLoadingStatesFn(undefined, store)
    return useLoadingStatesFn(keys as string | string[], store)
  }

  useApiComposer.prefetch = prefetch
  useApiComposer.useLoadingStates = useLoadingStates

  return useApiComposer as typeof useApiComposer & { prefetch: PrefetchFn; useLoadingStates: UseLoadingStatesFn }
}
