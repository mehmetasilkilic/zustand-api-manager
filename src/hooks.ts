import { useEffect, useRef } from 'react'
import { useApiStore } from './store'
import { ApiCallOptions, ApiHandlerResult, ApiStore, FetchStatus } from './types'
import type { StoreApi, UseBoundStore } from 'zustand'

/**
 * A React hook that returns whether any of the specified API calls are currently loading.
 * Useful for showing global loading indicators (e.g. progress bars, overlays).
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
 * @param store - Optional custom store instance (defaults to the singleton `useApiStore`).
 * @returns An {@link ApiHandlerResult} containing the current state (`data`, `error`, status booleans),
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
export const useApiHandler = <T>(
  key: string,
  store?: UseBoundStore<StoreApi<ApiStore>>
): ApiHandlerResult<T> => {
  const useStore = store ?? useApiStore
  const apiState = useStore(state => state.apiStates[key])
  const handleApi = useStore(state => state.handleApi)
  const resetApiState = useStore(state => state.resetApiState)
  const invalidateApi = useStore(state => state.invalidateApi)

  return {
    status: (apiState?.status ?? FetchStatus.IDLE) as FetchStatus,
    isIdle: !apiState || apiState.status === FetchStatus.IDLE,
    isLoading: apiState?.status === FetchStatus.LOADING,
    isError: apiState?.status === FetchStatus.ERROR,
    isSuccess: apiState?.status === FetchStatus.SUCCESS,
    data: (apiState?.data as T | undefined) ?? null,
    error: apiState?.error ?? null,
    fetchedAt: apiState?.fetchedAt ?? null,
    handleApi: (apiCall: () => Promise<{ data: T }>, options?: ApiCallOptions<T>) =>
      handleApi<T>(key, apiCall, options),
    resetApi: () => resetApiState(key),
    invalidateApi: () => invalidateApi(key)
  }
}

/**
 * A React hook that calls a callback at a regular interval.
 * Useful for polling an API endpoint on a timer.
 *
 * The callback reference is always kept up-to-date without restarting the interval.
 * Pass `null` or `undefined` as the interval to disable polling.
 *
 * @param callback - The function to call on each interval tick.
 * @param interval - The interval in milliseconds, or `null`/`undefined` to disable.
 *
 * @example
 * ```tsx
 * const { handleApi } = useApiHandler<User[]>('users')
 *
 * usePolling(() => handleApi(fetchUsers), 30_000)
 * ```
 */
export const usePolling = (
  callback: () => void | Promise<void>,
  interval: number | null | undefined
): void => {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (interval == null || interval <= 0) return

    const id = setInterval(() => callbackRef.current(), interval)
    return () => clearInterval(id)
  }, [interval])
}
