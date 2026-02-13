export * from './types'
export { useApiStore } from './store'
export { useLoadingStates, useApiQuery, usePolling, useApiMutation, usePrefetch } from './hooks'
export { createApiComposer } from './composer'
export { configureApiStore, resetGlobalConfig } from './config'
export type { GlobalApiConfig } from './config'

import { createApiStore as createStoreInternal } from './store'
import {
  useLoadingStates as useLoadingStatesFn,
  useApiQuery as useApiQueryFn,
  usePolling as usePollingFn,
  useApiMutation as useApiMutationFn,
  usePrefetch as usePrefetchFn
} from './hooks'
import { createApiComposer as createApiComposerFn } from './composer'
import type {
  ApiCallOptions,
  ApiComposerConfig,
  ApiStoreConfig,
  ApiHandlerResult,
  ApiMutationResult
} from './types'

/**
 * Creates a new Zustand store instance for managing API states,
 * along with pre-bound convenience hooks scoped to that store.
 *
 * This is the recommended way to create isolated API stores (e.g. per-feature
 * or for testing). The returned hooks (`useApiQuery`, `useLoadingStates`,
 * `usePolling`, `createApiComposer`) are already bound to the store instance —
 * no need to pass a `store` argument to each hook.
 *
 * @param config - Optional configuration for storage key and custom storage.
 * @returns An object containing `useStore` and pre-bound hooks/factories.
 *
 * @example
 * ```ts
 * const { useStore, useApiQuery, useLoadingStates, usePolling, createApiComposer } = createApiStore({
 *   storageKey: 'my-app-api',
 * })
 *
 * // Use bound hooks directly — no store argument needed
 * const { data, handleApi } = useApiQuery<User>('getUser')
 * const isLoading = useLoadingStates('getUser')
 * ```
 */
export function createApiStore(config?: ApiStoreConfig) {
  const { useStore } = createStoreInternal(config)
  return {
    useStore,
    useApiQuery: <T>(key: string): ApiHandlerResult<T> => useApiQueryFn<T>(key, useStore),
    useLoadingStates: (keys?: string | string[]): boolean => useLoadingStatesFn(keys, useStore),
    usePolling: <T>(
      key: string,
      apiCall: () => Promise<{ data: T }>,
      interval: number,
      options?: ApiCallOptions<T> & { enabled?: boolean; immediate?: boolean }
    ): ApiHandlerResult<T> => usePollingFn<T>(key, apiCall, interval, options, useStore),
    useApiMutation: <T, V = void>(
      key: string,
      mutationFn: (variables: V) => Promise<{ data: T }>
    ): ApiMutationResult<T, V> => useApiMutationFn<T, V>(key, mutationFn, useStore),
    usePrefetch: () => usePrefetchFn(useStore),
    createApiComposer: <TApi>(composerConfig?: ApiComposerConfig<TApi>) =>
      createApiComposerFn<TApi>({ ...composerConfig, store: useStore })
  }
}
