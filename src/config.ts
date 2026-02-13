import type { ApiCallOptions, ApiError } from './types'

/**
 * Global configuration options that can be set for all API calls.
 * These serve as defaults that can be overridden per individual API call.
 */
export interface GlobalApiConfig {
  /** Default number of retry attempts for all API calls */
  defaultRetry?: number
  /** Default stale time in milliseconds for all API calls */
  defaultStaleTime?: number
  /** Default timeout in milliseconds for all API calls */
  defaultTimeout?: number
  /** Default request deduplication setting */
  defaultDedupe?: boolean
  /** Global error handler called for all API errors */
  onError?: (error: ApiError, key: string) => void
  /** Global success handler called for all successful API calls */
  onSuccess?: <T>(data: T, key: string) => void
  /** Global settled handler called when any request completes */
  onSettled?: (key: string) => void
}

let globalConfig: GlobalApiConfig = {}

/**
 * Configure global defaults for all API calls.
 * These settings apply to all API calls unless explicitly overridden
 * in individual call options.
 *
 * @param config - Global configuration options
 *
 * @example
 * ```ts
 * import { configureApiStore } from 'zustand-api-manager'
 *
 * // Set global defaults
 * configureApiStore({
 *   defaultRetry: 3,
 *   defaultStaleTime: 60_000,
 *   defaultTimeout: 30_000,
 *   onError: (error, key) => {
 *     console.error(`API ${key} failed:`, error)
 *     showToast(`Error: ${error.message}`)
 *   }
 * })
 * ```
 */
export function configureApiStore(config: GlobalApiConfig): void {
  globalConfig = { ...globalConfig, ...config }
}

/**
 * Get the current global configuration.
 * Internal use only.
 */
export function getGlobalConfig(): GlobalApiConfig {
  return globalConfig
}

/**
 * Reset global configuration to empty defaults.
 * Useful for testing or when you want to clear all global settings.
 *
 * @example
 * ```ts
 * import { resetGlobalConfig } from 'zustand-api-manager'
 *
 * resetGlobalConfig()
 * ```
 */
export function resetGlobalConfig(): void {
  globalConfig = {}
}

/**
 * Merge global defaults with call-specific options.
 * Call options always take precedence over global defaults.
 * Internal use only.
 */
export function mergeWithGlobalConfig<T>(options: ApiCallOptions<T> = {}): ApiCallOptions<T> {
  const config = getGlobalConfig()

  return {
    retry: options.retry !== undefined ? options.retry : config.defaultRetry,
    staleTime: options.staleTime !== undefined ? options.staleTime : config.defaultStaleTime,
    timeout: options.timeout !== undefined ? options.timeout : config.defaultTimeout,
    dedupe: options.dedupe !== undefined ? options.dedupe : config.defaultDedupe,
    ...options,
    // Wrap callbacks to include global handlers
    onSuccess:
      options.onSuccess || config.onSuccess
        ? (data: T) => {
            options.onSuccess?.(data)
            // Key will be injected by the store
            // config.onSuccess?.(data, key)
          }
        : undefined,
    onError:
      options.onError || config.onError
        ? (error: ApiError) => {
            options.onError?.(error)
            // Key will be injected by the store
            // config.onError?.(error, key)
          }
        : undefined,
    onSettled:
      options.onSettled || config.onSettled
        ? () => {
            options.onSettled?.()
            // Key will be injected by the store
            // config.onSettled?.(key)
          }
        : undefined
  }
}
