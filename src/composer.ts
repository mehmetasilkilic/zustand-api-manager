import { useCallback, useEffect, useRef } from 'react'
import { useApiStore } from './store'
import {
  ApiCallOptions,
  ApiComposerConfig,
  ApiComposerReturn,
  ApiState,
  ApiStore,
  ComposerDeclarativeOptions,
  FetchStatus
} from './types'
import { isApiCallOptions } from './utils'
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
 *     createUser: (payload) => api.createUser(payload)
 *   }
 * })
 *
 * // Query usage (bound)
 * function UserProfile({ userId }: { userId: number }) {
 *   const { data, isLoading, query } = useApi('getUser')
 *
 *   useEffect(() => {
 *     query({ id: userId }, { staleTime: 60_000 })
 *   }, [userId, query])
 *
 *   return <div>{data?.name}</div>
 * }
 *
 * // Mutation usage
 * function CreateUser() {
 *   const { mutate, isLoading } = useApi('createUser')
 *
 *   const handleSubmit = () => {
 *     mutate({ name: 'John', email: 'john@example.com' })
 *   }
 *
 *   return <button onClick={handleSubmit}>Create</button>
 * }
 * ```
 */
export function createApiComposer<TApiStructure>(
  config?: ApiComposerConfig<TApiStructure> & { store?: UseBoundStore<StoreApi<ApiStore>> }
) {
  return function useApiComposer<K extends keyof TApiStructure>(
    key: K,
    declarativeOptions?: ComposerDeclarativeOptions<TApiStructure, K>
  ): ApiComposerReturn<TApiStructure, K> {
    const useStore = config?.store ?? useApiStore

    // Subscribe reactively to the state slice
    const apiState = useStore(state => state.apiStates[key as string]) as
      | ApiState<unknown>
      | undefined

    // Check if this is a mutation with a pre-bound function
    const mutationFn = config?.mutations?.[key] as
      | ((variables: unknown) => Promise<{ data: unknown }>)
      | undefined

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
    if (mutationFn) {
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

          return useStore
            .getState()
            .handleApi(key as string, () => mutationFnRef.current!(variables), options)
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

      const opts = declarativeOptionsRef.current as Record<string, unknown> | undefined
      const apiOptions: ApiCallOptions<unknown> = {}
      if (opts) {
        // Forward ApiCallOptions keys, excluding declarative-only keys
        for (const k of Object.keys(opts)) {
          if (k !== 'params' && k !== 'enabled' && k !== 'signal' && k !== 'optimisticData') {
            ;(apiOptions as Record<string, unknown>)[k] = opts[k]
          }
        }
      }

      const params = declParams
      useStore
        .getState()
        .handleApi(key as string, () => queryFnRef.current!(params), apiOptions)
    }, [key, serializedParams, enabled, isDeclarativeMode, useStore])

    return {
      ...commonState,
      fetchedAt: apiState?.fetchedAt ?? null,
      query,
      reset,
      invalidate
    } as ApiComposerReturn<TApiStructure, K>
  }
}
