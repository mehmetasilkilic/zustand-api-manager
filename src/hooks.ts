import { useApiStore } from './store'
import { ApiCallOptions, FetchStatus } from './types'

export const useLoadingStates = (keys?: string | string[]): boolean => {
  return useApiStore(state => {
    if (!keys) {
      return Object.values(state.apiStates).some(s => s.status === FetchStatus.LOADING)
    }
    const keyArray = Array.isArray(keys) ? keys : [keys]
    return keyArray.some(key => state.apiStates[key]?.status === FetchStatus.LOADING)
  })
}

export const useApiHandler = <T>(key: string) => {
  const apiState = useApiStore(state => state.apiStates[key])
  const handleApi = useApiStore(state => state.handleApi)
  const resetApiState = useApiStore(state => state.resetApiState)

  return {
    isIdle: !apiState || apiState.status === FetchStatus.IDLE,
    isLoading: apiState?.status === FetchStatus.LOADING,
    isError: apiState?.status === FetchStatus.ERROR,
    isSuccess: apiState?.status === FetchStatus.SUCCESS,
    data: (apiState?.data as T | undefined) ?? null,
    error: apiState?.error ?? null,
    handleApi: (apiCall: () => Promise<{ data: T }>, options?: ApiCallOptions) =>
      handleApi(key, apiCall, options),
    resetApi: () => resetApiState(key)
  }
}
