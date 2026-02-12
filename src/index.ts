export * from './types'
export { useApiStore } from './store'
export { useLoadingStates, useApiHandler } from './hooks'
export { createApiComposer } from './composer'

import { createApiStore as createStoreInternal } from './store'
import { useLoadingStates as useLoadingStatesFn, useApiHandler as useApiHandlerFn } from './hooks'
import { createApiComposer as createApiComposerFn } from './composer'
import type { ApiStoreConfig, ApiHandlerResult } from './types'

/**
 * Creates a new Zustand store instance for managing API states,
 * along with pre-bound convenience hooks scoped to that store.
 *
 * This is the recommended way to create isolated API stores (e.g. per-feature
 * or for testing). The returned hooks (`useApiHandler`, `useLoadingStates`,
 * `createApiComposer`) are already bound to the store instance — no need to
 * pass a `store` argument to each hook.
 *
 * @param config - Optional configuration for storage key and custom storage.
 * @returns An object containing `useStore` and pre-bound hooks/factories.
 *
 * @example
 * ```ts
 * const { useStore, useApiHandler, useLoadingStates, createApiComposer } = createApiStore({
 *   storageKey: 'my-app-api',
 * })
 *
 * // Use bound hooks directly — no store argument needed
 * const { data, handleApi } = useApiHandler<User>('getUser')
 * const isLoading = useLoadingStates('getUser')
 * ```
 */
export function createApiStore(config?: ApiStoreConfig) {
  const { useStore } = createStoreInternal(config)
  return {
    useStore,
    useApiHandler: <T>(key: string): ApiHandlerResult<T> => useApiHandlerFn<T>(key, useStore),
    useLoadingStates: (keys?: string | string[]): boolean => useLoadingStatesFn(keys, useStore),
    createApiComposer: <TApi>() => createApiComposerFn<TApi>(useStore)
  }
}
