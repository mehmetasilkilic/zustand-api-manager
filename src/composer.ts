import { useCallback, useRef } from 'react'
import { useApiStore } from './store'
import {
  ApiCallOptions,
  ApiComposerConfig,
  ApiState,
  ApiStore,
  FetchStatus
} from './types'
import type { StoreApi, UseBoundStore } from 'zustand'

/**
 * Creates a fully type-safe API hook factory based on a predefined API structure.
 *
 * Define your API structure as an interface mapping endpoint keys to
 * {@link ApiQueryEndpoint} or {@link ApiMutationEndpoint} types. The returned
 * hook automatically infers parameter and response types for each endpoint.
 *
 * For queries, the hook returns `handleApi` for manual triggering.
 * For mutations, the hook returns `mutate` with the mutation function pre-bound.
 *
 * @typeParam TApiStructure - An interface where each key maps to an endpoint type.
 * @param config - Optional configuration including mutation functions and custom store.
 * @returns A hook that accepts an endpoint key and returns the appropriate result type.
 *
 * @example
 * ```tsx
 * import { createApiComposer, ApiQueryEndpoint, ApiMutationEndpoint } from 'zustand-api-manager'
 *
 * interface MyApi {
 *   getUser: ApiQueryEndpoint<{ id: number }, User>
 *   createUser: ApiMutationEndpoint<CreateUserPayload, User>
 * }
 *
 * const useApi = createApiComposer<MyApi>({
 *   mutations: {
 *     createUser: (payload) => api.createUser(payload)
 *   }
 * })
 *
 * // Query usage
 * function UserProfile({ userId }: { userId: number }) {
 *   const { data, isLoading, handleApi } = useApi('getUser')
 *
 *   useEffect(() => {
 *     handleApi({ id: userId }, (params) => api.getUser(params))
 *   }, [userId, handleApi])
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
  // Return type is discriminated at call site based on whether the endpoint
  // is a query or mutation. We use `any` here since the actual type is
  // resolved correctly through TypeScript inference at the usage site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function useApiComposer<K extends keyof TApiStructure>(key: K): any {
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
          if (
            args.length === 0 ||
            (args.length === 1 && typeof args[0] === 'object' && 'onSuccess' in (args[0] as object))
          ) {
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
      }
    }

    // This is a query endpoint
    const query = useCallback(
      (...args: unknown[]) => {
        let params: unknown
        let apiCall: (params: unknown) => Promise<{ data: unknown }>
        let options: ApiCallOptions<unknown> | undefined

        // For void params: query(apiCall, options?)
        // For non-void params: query(params, apiCall, options?)
        if (typeof args[0] === 'function') {
          apiCall = args[0] as (params: unknown) => Promise<{ data: unknown }>
          options = args[1] as ApiCallOptions<unknown> | undefined
          params = undefined
        } else {
          params = args[0]
          apiCall = args[1] as (params: unknown) => Promise<{ data: unknown }>
          options = args[2] as ApiCallOptions<unknown> | undefined
        }

        return useStore.getState().handleApi(key as string, () => apiCall(params), options)
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

    return {
      ...commonState,
      fetchedAt: apiState?.fetchedAt ?? null,
      query,
      reset,
      invalidate
    }
  }
}

