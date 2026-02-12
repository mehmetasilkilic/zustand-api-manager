import { useApiStore } from './store'
import {
  ApiCallOptions,
  ApiComposerResult,
  ApiEndpoint,
  ApiState,
  ApiStore,
  FetchStatus
} from './types'
import type { StoreApi, UseBoundStore } from 'zustand'

/**
 * Creates a fully type-safe API hook factory based on a predefined API structure.
 *
 * Define your API structure as an interface mapping endpoint keys to
 * {@link ApiEndpoint} types, then pass it as a generic parameter. The returned
 * hook automatically infers parameter and response types for each endpoint.
 *
 * @typeParam TApiStructure - An interface where each key maps to an `ApiEndpoint<Params, Response>`.
 * @param store - Optional custom store instance (defaults to the singleton `useApiStore`).
 * @returns A hook that accepts an endpoint key and returns a typed {@link ApiComposerResult}.
 *
 * @example
 * ```tsx
 * import { createApiComposer, ApiEndpoint } from 'zustand-api-manager'
 *
 * interface MyApi {
 *   getUser: ApiEndpoint<{ id: number }, User>
 *   listPosts: ApiEndpoint<void, Post[]>
 * }
 *
 * const useApi = createApiComposer<MyApi>()
 *
 * function UserProfile({ userId }: { userId: number }) {
 *   const { data, isLoading, handleApi, resetApi } = useApi('getUser')
 *
 *   useEffect(() => {
 *     handleApi({ id: userId }, (params) => api.getUser(params), { retry: 2 })
 *   }, [userId])
 *
 *   if (isLoading) return <Spinner />
 *   return <div>{data?.name}</div>
 * }
 * ```
 */
export function createApiComposer<TApiStructure>(store?: UseBoundStore<StoreApi<ApiStore>>) {
  return function useApiComposer<K extends keyof TApiStructure>(
    key: K
  ): TApiStructure[K] extends ApiEndpoint<infer P, infer R> ? ApiComposerResult<R, P> : never {
    type Entry = TApiStructure[K] extends ApiEndpoint<infer P, infer R> ? ApiEndpoint<P, R> : never
    type Params = Entry['params']
    type Response = Entry['response']

    const useStore = store ?? useApiStore
    const apiState = useStore(state => state.apiStates[key as string]) as
      | ApiState<Response>
      | undefined
    const handleApi = useStore(state => state.handleApi)
    const resetApiState = useStore(state => state.resetApiState)
    const invalidateApiState = useStore(state => state.invalidateApi)

    const composerHandleApi = (...args: unknown[]) => {
      let params: Params
      let apiCall: (params: Params) => Promise<{ data: Response }>
      let options: ApiCallOptions<Response> | undefined

      // For void params: handleApi(apiCall, options?)
      // For non-void params: handleApi(params, apiCall, options?)
      if (typeof args[0] === 'function') {
        apiCall = args[0] as (params: Params) => Promise<{ data: Response }>
        options = args[1] as ApiCallOptions<Response> | undefined
        params = undefined as Params
      } else {
        params = args[0] as Params
        apiCall = args[1] as (params: Params) => Promise<{ data: Response }>
        options = args[2] as ApiCallOptions<Response> | undefined
      }

      return handleApi(key as string, () => apiCall(params), options)
    }

    return {
      data: apiState?.data ?? null,
      status: (apiState?.status ?? FetchStatus.IDLE) as FetchStatus,
      isIdle: !apiState || apiState.status === FetchStatus.IDLE,
      isLoading: apiState?.status === FetchStatus.LOADING,
      isSuccess: apiState?.status === FetchStatus.SUCCESS,
      isError: apiState?.status === FetchStatus.ERROR,
      error: apiState?.error ?? null,
      fetchedAt: apiState?.fetchedAt ?? null,
      handleApi: composerHandleApi,
      resetApi: () => resetApiState(key as string),
      invalidateApi: () => invalidateApiState(key as string)
    } as TApiStructure[K] extends ApiEndpoint<infer P, infer R> ? ApiComposerResult<R, P> : never
  }
}
