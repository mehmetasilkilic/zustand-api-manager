import { useApiStore } from './store'
import { ApiCallOptions, FetchStatus } from './types'

/**
 * A React hook that returns whether any of the specified API calls are currently loading.
 * Useful for showing global loading indicators (e.g. progress bars, overlays).
 *
 * @param keys - A single API key, an array of API keys, or `undefined` to check all tracked APIs.
 * @returns `true` if at least one of the specified API calls has status `LOADING`.
 *
 * @example
 * ```tsx
 * // Check if any API call is loading
 * const isAnyLoading = useLoadingStates()
 *
 * // Check a single key
 * const isUserLoading = useLoadingStates('getUser')
 *
 * // Check multiple keys
 * const isDataLoading = useLoadingStates(['getUser', 'getPosts'])
 * ```
 */
export const useLoadingStates = (keys?: string | string[]): boolean => {
  return useApiStore(state => {
    if (!keys) {
      return Object.values(state.apiStates).some(s => s.status === FetchStatus.LOADING)
    }
    const keyArray = Array.isArray(keys) ? keys : [keys]
    return keyArray.some(key => state.apiStates[key]?.status === FetchStatus.LOADING)
  })
}

/**
 * A React hook that provides reactive access to a single API endpoint's state
 * along with functions to trigger the API call and reset its state.
 *
 * This is the primary hook for interacting with individual API endpoints.
 *
 * @typeParam T - The expected response data type.
 * @param key - The unique identifier for the API endpoint.
 * @returns An object containing the current state (`data`, `error`, status booleans),
 *          a `handleApi` function to trigger the call, and a `resetApi` function to clear the state.
 *
 * @example
 * ```tsx
 * interface User { id: number; name: string }
 *
 * function UserProfile() {
 *   const { data, isLoading, isError, error, handleApi, resetApi } = useApiHandler<User>('getUser')
 *
 *   useEffect(() => {
 *     handleApi(() => fetch('/api/user').then(r => r.json()))
 *   }, [])
 *
 *   if (isLoading) return <Spinner />
 *   if (isError) return <Error message={error?.message} />
 *   return <div>{data?.name}</div>
 * }
 * ```
 */
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
