import { useApiStore } from './store'
import { ApiCallOptions, ApiComposerResult, ApiEndpoint, ApiState, FetchStatus } from './types'

/**
 * Creates a fully type-safe API hook factory based on a predefined API structure.
 *
 * Define your API structure as an interface mapping endpoint keys to
 * {@link ApiEndpoint} types, then pass it as a generic parameter. The returned
 * hook automatically infers parameter and response types for each endpoint.
 *
 * @typeParam TApiStructure - An interface where each key maps to an `ApiEndpoint<Params, Response>`.
 * @returns A React hook that accepts an endpoint key and returns a typed {@link ApiComposerResult}.
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
 *   const { data, isLoading, handleApi } = useApi('getUser')
 *
 *   useEffect(() => {
 *     handleApi((params) => api.getUser(params), { retry: 2 })
 *   }, [userId])
 *
 *   if (isLoading) return <Spinner />
 *   return <div>{data?.name}</div>
 * }
 * ```
 */
export function createApiComposer<TApiStructure>() {
  return function useApiComposer<K extends keyof TApiStructure>(
    key: K
  ): TApiStructure[K] extends ApiEndpoint<infer P, infer R> ? ApiComposerResult<R, P> : never {
    type Entry = TApiStructure[K] extends ApiEndpoint<infer P, infer R> ? ApiEndpoint<P, R> : never
    type Params = Entry['params']
    type Response = Entry['response']

    const apiState = useApiStore(state => state.apiStates[key as string]) as
      | ApiState<Response>
      | undefined
    const handleApi = useApiStore(state => state.handleApi)

    return {
      data: apiState?.data ?? null,
      isIdle: !apiState || apiState.status === FetchStatus.IDLE,
      isLoading: apiState?.status === FetchStatus.LOADING,
      isSuccess: apiState?.status === FetchStatus.SUCCESS,
      isError: apiState?.status === FetchStatus.ERROR,
      error: apiState?.error ?? null,
      handleApi: (
        apiCall: (params: Params) => Promise<{ data: Response }>,
        options?: ApiCallOptions
      ) => handleApi(key as string, apiCall as unknown as () => Promise<{ data: Response }>, options)
    } as TApiStructure[K] extends ApiEndpoint<infer P, infer R> ? ApiComposerResult<R, P> : never
  }
}
