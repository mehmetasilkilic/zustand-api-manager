export * from './types'
export { useApiStore } from './store'
export { useLoadingStates } from './hooks'
export { createApiComposer } from './composer'
export { configureApiStore, resetGlobalConfig } from './config'
export type { GlobalApiConfig } from './config'

import { createApiStore as createStoreInternal } from './store'
import { useLoadingStates as useLoadingStatesFn } from './hooks'
import { createApiComposer as createApiComposerFn } from './composer'
import type { ApiComposerConfig, ApiStoreConfig } from './types'

/**
 * Creates a new Zustand store instance for managing API states,
 * along with pre-bound convenience utilities scoped to that store.
 *
 * The returned object includes `useStore`, `useLoadingStates`, and
 * `createApiComposer` — all bound to the store instance.
 *
 * @param config - Optional configuration for storage key and custom storage.
 * @returns An object containing `useStore` and pre-bound utilities.
 *
 * @example
 * ```ts
 * const { useStore, useLoadingStates, createApiComposer } = createApiStore({
 *   storageKey: 'my-app-api',
 * })
 *
 * const useApi = createApiComposer<MyApi>({
 *   queries: { ... },
 *   mutations: { ... }
 * })
 * ```
 */
export function createApiStore(config?: ApiStoreConfig) {
  const { useStore } = createStoreInternal(config)
  return {
    useStore,
    useLoadingStates: (keys?: string | string[]): boolean => useLoadingStatesFn(keys, useStore),
    createApiComposer: <TApi>(composerConfig?: ApiComposerConfig<TApi>) =>
      createApiComposerFn<TApi>({ ...composerConfig, store: useStore })
  }
}
