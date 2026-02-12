import { useApiStore } from './store'
import { ApiCallOptions, ApiState, FetchStatus } from './types'

export const useLoadingStates = (keys?: string | string[]): boolean => {
  const { apiStates } = useApiStore()
  if (!keys) {
    return Object.values(apiStates).some(state => state.status === FetchStatus.LOADING)
  }
  const keyArray = Array.isArray(keys) ? keys : [keys]
  return keyArray.some(key => apiStates[key]?.status === FetchStatus.LOADING)
}

export const useApiHandler = <T, P = void>(key: string) => {
  const { apiStates, handleApi, resetApiState } = useApiStore()

  const apiState = apiStates[key] as ApiState<T> | undefined

  return {
    isLoading: apiState?.status === FetchStatus.LOADING,
    isError: apiState?.status === FetchStatus.ERROR,
    isSuccess: apiState?.status === FetchStatus.SUCCESS,
    data: apiState?.data,
    error: apiState?.error,
    handleApi: (apiCall: (params: P) => Promise<{ data: T }>, options?: ApiCallOptions) =>
      handleApi(key, apiCall, options),
    resetApi: () => resetApiState(key)
  }
}
