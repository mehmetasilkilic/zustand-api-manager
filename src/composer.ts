import { useApiStore } from './store'
import { ApiCallOptions, ApiComposerResult, ApiEndpoint, ApiState, FetchStatus } from './types'

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
