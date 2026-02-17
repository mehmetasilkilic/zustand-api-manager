import { useCallback, useEffect, useRef } from 'react'
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
import { isApiCallOptions } from './utils'
import type { StoreApi, UseBoundStore } from 'zustand'

/** Internal normalized shape for every mutation endpoint. */
interface NormalizedMutation {
  fn: (variables: unknown) => Promise<{ data: unknown }>
  invalidates: string[]
  optimistic: Record<string, (variables: unknown, currentData: unknown) => unknown>
}

/** Normalize a bare function or MutationEndpointConfig into a consistent shape. */
function normalizeMutation(
  entry: ((variables: unknown) => Promise<{ data: unknown }>) | MutationEndpointConfig<any, any, any>
): NormalizedMutation {
  if (typeof entry === 'function') {
    return { fn: entry, invalidates: [], optimistic: {} }
  }
  return {
    fn: entry.fn as (variables: unknown) => Promise<{ data: unknown }>,
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

  // ── Active query tracking (shared across all hook instances) ──

  const activeQueries = new Map<string, { params: unknown }>()

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

    // Subscribe reactively to the state slice
    const apiState = useStore(state => state.apiStates[key as string]) as
      | ApiState<unknown>
      | undefined

    // Check if this is a mutation with a pre-bound function
    const normalizedMutation = normalizedMutations.get(key as string)
    const mutationFn = normalizedMutation?.fn
    const mutationFnRef = useRef(mutationFn)
    mutationFnRef.current = mutationFn

    // Check if this is a query with a pre-bound function
    const queryFn = config?.queries?.[key] as
      | ((params: unknown) => Promise<{ data: unknown }>)
      | undefined

    const queryFnRef = useRef(queryFn)
    queryFnRef.current = queryFn

    // Declarative mode detection: second arg provided AND this is a query endpoint (not mutation)
    const isDeclarativeMode = declarativeOptions != null && !mutationFn
    const declParams = isDeclarativeMode
      ? (declarativeOptions as { params?: unknown }).params
      : undefined
    const serializedParams = isDeclarativeMode ? JSON.stringify(declParams) : ''
    const enabled = isDeclarativeMode
      ? (declarativeOptions as { enabled?: boolean }).enabled !== false
      : false

    // Keep declarative options in ref so the effect uses latest without restarting
    const declarativeOptionsRef = useRef(declarativeOptions)
    declarativeOptionsRef.current = declarativeOptions

    // Common state accessors
    const commonState = {
      data: apiState?.data ?? null,
      status: (apiState?.status ?? FetchStatus.IDLE) as FetchStatus,
      isIdle: !apiState || apiState.status === FetchStatus.IDLE,
      isLoading: apiState?.status === FetchStatus.LOADING,
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

          // For void variables: mutate(options?)
          // For non-void variables: mutate(variables, options?)
          if (args.length === 0 || (args.length === 1 && isApiCallOptions(args[0]))) {
            variables = undefined
            options = args[0] as ApiCallOptions<unknown> | undefined
          } else {
            variables = args[0]
            options = args[1] as ApiCallOptions<unknown> | undefined
          }

          const store = useStore.getState()
          const norm = normalizedMutations.get(key as string)!
          const { invalidates, optimistic } = norm

          // ── Cross-endpoint optimistic updates ──
          const snapshots = new Map<string, unknown>()
          const optimisticKeys = Object.keys(optimistic)

          if (optimisticKeys.length > 0) {
            for (const qKey of optimisticKeys) {
              const updater = optimistic[qKey]
              if (!updater) continue
              const currentState = store.apiStates[qKey]
              const currentData = currentState?.data ?? null
              snapshots.set(qKey, currentData)
              const newData = updater(variables, currentData)
              store.setApiState(qKey, { data: newData })
            }
          }

          // ── Execute the mutation via handleApi ──
          const userOnSuccess = options?.onSuccess
          const userOnError = options?.onError

          const wrappedOptions: ApiCallOptions<unknown> = {
            ...options,
            onSuccess: (data: unknown) => {
              // Invalidate caches
              if (invalidates.length > 0) {
                store.invalidateApis(invalidates)

                // Re-trigger active declarative queries for invalidated keys
                for (const qKey of invalidates) {
                  const active = activeQueries.get(qKey)
                  const boundQueryFn = config?.queries?.[qKey as keyof TApiStructure] as
                    | ((params: unknown) => Promise<{ data: unknown }>)
                    | undefined
                  if (active && boundQueryFn) {
                    store.handleApi(qKey, () => boundQueryFn(active.params))
                  }
                }
              }

              userOnSuccess?.(data)
            },
            onError: (error) => {
              // Rollback optimistic snapshots
              if (snapshots.size > 0) {
                for (const [qKey, previousData] of snapshots) {
                  store.setApiState(qKey, { data: previousData })
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

        // query(params, options?) or query(options?) for void params
        if (args.length === 0 || (args.length === 1 && isApiCallOptions(args[0]))) {
          params = undefined
          options = args[0] as ApiCallOptions<unknown> | undefined
        } else {
          params = args[0]
          options = args[1] as ApiCallOptions<unknown> | undefined
        }

        return useStore
          .getState()
          .handleApi(key as string, () => queryFnRef.current!(params), options)
      },
      [key, useStore]
    )

    const reset = useCallback(
      () => useStore.getState().resetApiState(key as string),
      [key, useStore]
    )

    const invalidate = useCallback(
      () => useStore.getState().invalidateApi(key as string),
      [key, useStore]
    )

    // Declarative auto-fetch effect for query endpoints
    useEffect(() => {
      if (!isDeclarativeMode || !enabled || !queryFnRef.current) return

      // Register in active queries for invalidation refetch
      activeQueries.set(key as string, { params: declParams })

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

      const params = declParams
      useStore
        .getState()
        .handleApi(key as string, () => queryFnRef.current!(params), apiOptions)

      // Polling support
      const pollingInterval = (declarativeOptionsRef.current as { polling?: number } | undefined)?.polling

      if (pollingInterval && pollingInterval > 0) {
        const tick = () => {
          const currentState = useStore.getState().apiStates[key as string]
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
          useStore.getState().handleApi(key as string, () => queryFnRef.current!(currentParams), pollApiOptions)
        }

        const intervalId = setInterval(tick, pollingInterval)
        return () => {
          activeQueries.delete(key as string)
          clearInterval(intervalId)
        }
      }

      // Cleanup: deregister from active queries
      return () => {
        activeQueries.delete(key as string)
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
      | ((params: unknown) => Promise<{ data: unknown }>)
      | undefined
    if (!queryFn) return Promise.resolve(undefined)

    // Parse args: last arg might be options, everything before is params
    let params: unknown
    let options: Omit<ApiCallOptions<unknown>, 'onSuccess' | 'onError' | 'onSettled'> | undefined

    if (args.length === 0) {
      params = undefined
    } else if (args.length === 1) {
      // Could be params or options — check if it looks like options
      if (isApiCallOptions(args[0])) {
        params = undefined
        options = args[0] as typeof options
      } else {
        params = args[0]
      }
    } else {
      params = args[0]
      options = args[1] as typeof options
    }

    return store.getState().handleApi(key, () => queryFn(params), {
      ...options,
      onSuccess: undefined,
      onError: undefined,
      onSettled: undefined
    })
  }

  useApiComposer.prefetch = prefetch

  return useApiComposer as typeof useApiComposer & { prefetch: PrefetchFn }
}
