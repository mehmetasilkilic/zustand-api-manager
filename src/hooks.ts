import { useCallback, useEffect, useRef } from 'react'
import { useApiStore } from './store'
import {
  ApiCallOptions,
  ApiQueryResult,
  ApiMutationResult,
  ApiStore,
  FetchStatus,
  UseApiQueryOptions
} from './types'
import { isApiCallOptions } from './utils'
import type { StoreApi, UseBoundStore } from 'zustand'

/**
 * A hook that returns whether any of the specified API calls are currently loading.
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
 * A hook for managing API queries (GET requests, read operations).
 * Provides reactive access to query state along with functions to trigger,
 * reset, and invalidate the query.
 *
 * Supports two modes:
 * - **Observer mode** (no `queryFn`): Reads state written by another component. No auto-fetch.
 * - **Declarative mode** (`queryFn` provided): Automatically fetches on mount and when `key`/`enabled` changes.
 *
 * The returned `query`, `reset`, and `invalidate` functions are
 * referentially stable (wrapped in `useCallback`), so they are safe to use
 * in `useEffect` dependency arrays and memoized children.
 *
 * @typeParam T - The expected response data type.
 * @param key - The unique identifier for the API endpoint.
 * @param optionsOrStore - Either a custom store instance (observer mode) or options with `queryFn` (declarative mode).
 * @returns An {@link ApiQueryResult} containing the current state (`data`, `error`, status booleans),
 *          a `query` function to trigger the call, and a `reset` function to clear the state.
 *
 * @example
 * ```tsx
 * // Declarative mode — auto-fetches on mount
 * const { data, isLoading } = useApiQuery<User>('getUser', {
 *   queryFn: () => fetch('/api/user').then(r => r.json()),
 *   staleTime: 30_000
 * })
 *
 * // Observer mode — reads data fetched elsewhere
 * const { data } = useApiQuery<User>('getUser')
 * ```
 */
export function useApiQuery<T>(
  key: string,
  options?: UseApiQueryOptions<T>,
  storeOverride?: UseBoundStore<StoreApi<ApiStore>>
): ApiQueryResult<T> {
  const useStore = storeOverride ?? useApiStore

  const queryFn = options?.queryFn
  const enabled = options?.enabled !== false

  // Keep queryFn and options in refs so the effect always uses the latest
  // without restarting.
  const queryFnRef = useRef(queryFn)
  queryFnRef.current = queryFn

  const optionsRef = useRef(options)
  optionsRef.current = options

  // Only subscribe reactively to the slice that actually changes.
  // Store methods are stable references defined once in create(),
  // so we read them via getState() to avoid unnecessary subscriptions.
  const apiState = useStore(state => state.apiStates[key])

  const query = useCallback(
    (apiCall: () => Promise<{ data: T }>, callOptions?: ApiCallOptions<T>) =>
      useStore.getState().handleApi<T>(key, apiCall, callOptions),
    [key, useStore]
  )

  const reset = useCallback(() => useStore.getState().resetApiState(key), [key, useStore])

  const invalidate = useCallback(() => useStore.getState().invalidateApi(key), [key, useStore])

  // Declarative auto-fetch effect
  useEffect(() => {
    if (!queryFnRef.current || !enabled) return

    const opts = optionsRef.current
    const apiOptions: ApiCallOptions<T> = {
      ...opts,
      queryFn: undefined,
      enabled: undefined
    } as ApiCallOptions<T>

    useStore.getState().handleApi(key, () => queryFnRef.current!(), apiOptions)
  }, [key, enabled, useStore])

  return {
    status: (apiState?.status ?? FetchStatus.IDLE) as FetchStatus,
    isIdle: !apiState || apiState.status === FetchStatus.IDLE,
    isLoading: apiState?.status === FetchStatus.LOADING,
    isError: apiState?.status === FetchStatus.ERROR,
    isSuccess: apiState?.status === FetchStatus.SUCCESS,
    data: (apiState?.data as T | undefined) ?? null,
    error: apiState?.error ?? null,
    fetchedAt: apiState?.fetchedAt ?? null,
    query,
    reset,
    invalidate
  }
}

/**
 * A React hook that polls an API endpoint at a regular interval with automatic
 * lifecycle management. Polling starts on mount (or when `enabled` becomes `true`)
 * and stops on unmount (or when `enabled` becomes `false`).
 *
 * Uses refs internally so that the latest `apiCall` and `options` are always
 * used on each tick without restarting the interval.
 *
 * If the previous poll is still in-flight when the next tick fires, the tick
 * is skipped to prevent request stacking.
 *
 * @typeParam T - The expected response data type.
 * @param key - The unique identifier for the API endpoint.
 * @param apiCall - A function that returns a promise resolving to `{ data: T }`.
 * @param interval - The polling interval in milliseconds.
 * @param options - Optional configuration for the API call, plus:
 *   - `enabled` — If `false`, polling is paused. Defaults to `true`.
 *   - `immediate` — If `true`, fires the first request immediately instead of waiting for the first interval.
 * @param store - Optional custom store instance (defaults to the singleton `useApiStore`).
 * @returns An {@link ApiQueryResult} containing the current state and control functions.
 *
 * @example
 * ```tsx
 * function NotificationBell() {
 *   const { data, isLoading } = usePolling<Notification[]>(
 *     'notifications',
 *     () => fetchNotifications(),
 *     10_000,
 *     { immediate: true }
 *   )
 *
 *   return <span>({data?.length ?? 0})</span>
 * }
 * ```
 */
export const usePolling = <T>(
  key: string,
  apiCall: () => Promise<{ data: T }>,
  interval: number,
  options?: ApiCallOptions<T> & { enabled?: boolean; immediate?: boolean },
  store?: UseBoundStore<StoreApi<ApiStore>>
): ApiQueryResult<T> => {
  const useStore = store ?? useApiStore
  const handler = useApiQuery<T>(key, undefined, useStore)

  // Keep apiCall and options fresh without restarting the polling interval.
  const apiCallRef = useRef(apiCall)
  apiCallRef.current = apiCall

  const optionsRef = useRef(options)
  optionsRef.current = options

  const enabled = options?.enabled !== false

  useEffect(() => {
    if (!enabled) return

    const tick = () => {
      const current = useStore.getState().apiStates[key]
      if (current?.status === FetchStatus.LOADING) return
      const opts = optionsRef.current
      const apiOptions: ApiCallOptions<T> = {
        ...opts,
        enabled: undefined,
        immediate: undefined
      } as ApiCallOptions<T>
      useStore.getState().handleApi(key, () => apiCallRef.current(), apiOptions)
    }

    if (optionsRef.current?.immediate) tick()
    const id = setInterval(tick, interval)
    return () => clearInterval(id)
  }, [key, interval, enabled, useStore])

  return handler
}

/**
 * A hook for managing API mutations (POST, PUT, DELETE, PATCH operations).
 * Unlike `useApiQuery` which is designed for queries (GET), this hook is
 * optimized for mutations with better semantics (mutate instead of query).
 *
 * Mutations don't use caching by default and provide a simpler API focused
 * on write operations with variables/payload.
 *
 * @typeParam T - The expected response data type.
 * @typeParam V - The variables/payload type to pass to the mutation function.
 * @param key - The unique identifier for the mutation endpoint.
 * @param mutationFn - A function that accepts variables and returns a promise resolving to `{ data: T }`.
 * @param store - Optional custom store instance (defaults to the singleton `useApiStore`).
 * @returns An {@link ApiMutationResult} containing the current state and a `mutate` function.
 *
 * @example
 * ```tsx
 * interface CreateUserPayload { name: string; email: string }
 * interface User { id: number; name: string; email: string }
 *
 * function CreateUserForm() {
 *   const { mutate, isLoading, isSuccess, data, error } = useApiMutation<User, CreateUserPayload>(
 *     'createUser',
 *     (payload) => api.post('/users', payload)
 *   )
 *
 *   const handleSubmit = async (formData: CreateUserPayload) => {
 *     const newUser = await mutate(formData, {
 *       onSuccess: (user) => console.log('Created:', user),
 *       onError: (err) => console.error('Failed:', err)
 *     })
 *   }
 *
 *   return (
 *     <form onSubmit={e => { e.preventDefault(); handleSubmit(formData) }}>
 *       {isLoading && <Spinner />}
 *       {isSuccess && <div>User created: {data?.name}</div>}
 *       {error && <div>Error: {error.message}</div>}
 *     </form>
 *   )
 * }
 * ```
 */
export const useApiMutation = <T, V = void>(
  key: string,
  mutationFn: (variables: V) => Promise<{ data: T }>,
  store?: UseBoundStore<StoreApi<ApiStore>>
): ApiMutationResult<T, V> => {
  const useStore = store ?? useApiStore

  // Only subscribe reactively to the slice that actually changes
  const apiState = useStore(state => state.apiStates[key])

  const mutationFnRef = useRef(mutationFn)
  mutationFnRef.current = mutationFn

  const mutate = useCallback(
    (...args: unknown[]) => {
      let variables: V
      let options: ApiCallOptions<T> | undefined

      // For void variables: mutate(options?)
      // For non-void variables: mutate(variables, options?)
      if (args.length === 0 || (args.length === 1 && isApiCallOptions(args[0]))) {
        variables = undefined as V
        options = args[0] as ApiCallOptions<T> | undefined
      } else {
        variables = args[0] as V
        options = args[1] as ApiCallOptions<T> | undefined
      }

      return useStore.getState().handleApi<T>(key, () => mutationFnRef.current(variables), options)
    },
    [key, useStore]
  )

  const reset = useCallback(() => useStore.getState().resetApiState(key), [key, useStore])

  return {
    data: (apiState?.data as T | undefined) ?? null,
    status: (apiState?.status ?? FetchStatus.IDLE) as FetchStatus,
    isIdle: !apiState || apiState.status === FetchStatus.IDLE,
    isLoading: apiState?.status === FetchStatus.LOADING,
    isSuccess: apiState?.status === FetchStatus.SUCCESS,
    isError: apiState?.status === FetchStatus.ERROR,
    error: apiState?.error ?? null,
    mutate,
    reset
  }
}

/**
 * A hook that provides a `prefetch` function for preloading data before it's needed.
 * Useful for optimistic data loading, hover states, or preloading for next pages.
 *
 * Prefetched data is stored in the cache and can be configured with `staleTime`
 * to avoid redundant refetching.
 *
 * @param store - Optional custom store instance (defaults to the singleton `useApiStore`).
 * @returns An object with a `prefetch` function.
 *
 * @example
 * ```tsx
 * function UserList() {
 *   const { prefetch } = usePrefetch()
 *
 *   const handleMouseEnter = (userId: number) => {
 *     // Prefetch user details on hover
 *     prefetch(`user-${userId}`, () => api.getUser(userId), {
 *       staleTime: 60_000
 *     })
 *   }
 *
 *   return (
 *     <ul>
 *       {users.map(user => (
 *         <li key={user.id} onMouseEnter={() => handleMouseEnter(user.id)}>
 *           {user.name}
 *         </li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 */
export const usePrefetch = (store?: UseBoundStore<StoreApi<ApiStore>>) => {
  const useStore = store ?? useApiStore

  const prefetch = useCallback(
    <T>(
      key: string,
      apiCall: () => Promise<{ data: T }>,
      options?: Omit<ApiCallOptions<T>, 'onSuccess' | 'onError' | 'onSettled'>
    ) => {
      // Silently prefetch without triggering callbacks
      return useStore.getState().handleApi<T>(key, apiCall, {
        ...options,
        // Don't call user callbacks during prefetch
        onSuccess: undefined,
        onError: undefined,
        onSettled: undefined
      })
    },
    [useStore]
  )

  return { prefetch }
}
