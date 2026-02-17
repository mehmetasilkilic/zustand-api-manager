import { useApiStore } from './store'
import { ApiStore, FetchStatus } from './types'
import type { StoreApi, UseBoundStore } from 'zustand'

/**
 * A hook that returns whether any of the specified API calls are currently loading.
 * Useful for showing global loading indicators (e.g. progress bars, overlays).
 *
 * Supports composite cache keys: passing a bare endpoint name like `'getUser'`
 * will also match parameterized keys such as `'getUser::{"id":1}'`.
 *
 * @param keys - A single API key, an array of API keys, or `undefined` to check all tracked APIs.
 * @param store - Optional custom store instance (defaults to the singleton `useApiStore`).
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
export const useLoadingStates = (
  keys?: string | string[],
  store?: UseBoundStore<StoreApi<ApiStore>>
): boolean => {
  const useStore = store ?? useApiStore
  return useStore(state => {
    if (!keys) {
      return Object.values(state.apiStates).some(s => s.status === FetchStatus.LOADING)
    }
    const keyArray = Array.isArray(keys) ? keys : [keys]
    return keyArray.some(key => {
      if (state.apiStates[key]?.status === FetchStatus.LOADING) return true
      const prefix = key + '::'
      return Object.keys(state.apiStates).some(
        k => k.startsWith(prefix) && state.apiStates[k]?.status === FetchStatus.LOADING
      )
    })
  })
}
