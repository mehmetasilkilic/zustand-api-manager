/**
 * Represents the lifecycle status of an API request.
 *
 * @example
 * ```ts
 * if (state.status === FetchStatus.LOADING) {
 *   showSpinner()
 * }
 * ```
 */
export const FetchStatus = {
  /** No request has been made yet. This is the default state. */
  IDLE: 'IDLE',
  /** A request is currently in progress. */
  LOADING: 'LOADING',
  /** The request completed successfully. */
  SUCCESS: 'SUCCESS',
  /** The request failed with an error. */
  ERROR: 'ERROR'
} as const
export type FetchStatus = (typeof FetchStatus)[keyof typeof FetchStatus]

/**
 * Holds the current state of a single API endpoint, including its fetch status,
 * response data, and any error that may have occurred.
 *
 * @typeParam T - The type of the expected response data.
 *
 * @example
 * ```ts
 * const userState: ApiState<User> = {
 *   status: FetchStatus.SUCCESS,
 *   data: { id: 1, name: 'John' },
 *   error: null,
 *   fetchedAt: 1700000000000
 * }
 * ```
 */
export interface ApiState<T> {
  /** The current lifecycle status of the API request. */
  status: FetchStatus
  /** The response data, or `null` if not yet loaded or on error. */
  data: T | null
  /** The error object if the request failed, otherwise `null`. */
  error: ApiError | null
  /** Timestamp (ms since epoch) of the last successful fetch, or `null` if never fetched. */
  fetchedAt: number | null
}

/**
 * An extended `Error` object returned when an API request fails.
 * Includes optional HTTP status code and error code fields.
 */
export interface ApiError extends Error {
  /** The HTTP status code of the failed response (e.g. `404`, `500`). */
  status?: number
  /** A machine-readable error code (e.g. `'ABORT_ERR'`, `'NETWORK_ERROR'`). */
  code?: string
}

/**
 * Configuration options passed to `handleApi` to customize the behavior of an API call.
 *
 * @typeParam T - The expected response data type (used for typed `onSuccess` and `optimisticData`).
 *
 * @example
 * ```ts
 * const controller = new AbortController()
 *
 * handleApi('users', fetchUsers, {
 *   persist: true,
 *   retry: 3,
 *   staleTime: 30_000,
 *   signal: controller.signal,
 *   onSuccess: (data) => console.log('Loaded!', data),
 *   onError: (error) => console.error('Failed!', error)
 * })
 * ```
 */
export interface ApiCallOptions<T = unknown> {
  /** Callback invoked when the API call succeeds. Receives the typed response data. */
  onSuccess?: (data: T) => void
  /** Callback invoked when the API call fails (after all retries are exhausted). Receives the error. */
  onError?: (error: ApiError) => void
  /** If `true`, the resulting state will be persisted to `localStorage` and survive page reloads. */
  persist?: boolean
  /** An `AbortSignal` to cancel the request. When aborted, the state transitions to `ERROR` with code `'ABORT_ERR'`. */
  signal?: AbortSignal
  /** Number of retry attempts on failure. Uses exponential backoff (max 10s). Defaults to `0` (no retries). */
  retry?: number
  /**
   * If the data was successfully fetched within this many milliseconds, skip the request
   * and return the cached data immediately. Useful for avoiding redundant refetches.
   */
  staleTime?: number
  /**
   * Data to set optimistically before the request completes.
   * The data will be visible immediately while the request is in-flight.
   * On error, the state is rolled back to the previous data.
   */
  optimisticData?: T
  /**
   * Callback invoked when the API call completes, regardless of whether it succeeded or failed.
   * Useful for cleanup logic like hiding modals or stopping spinners.
   */
  onSettled?: () => void
  /**
   * Timeout in milliseconds. If the request does not complete within this duration,
   * it will be aborted with error code `'TIMEOUT'`.
   */
  timeout?: number
  /**
   * A predicate that determines whether a failed request should be retried.
   * Receives the error and the current attempt index (0-based).
   * Return `false` to stop retrying immediately. Defaults to always retry (up to `retry` count).
   *
   * @example
   * ```ts
   * handleApi('users', fetchUsers, {
   *   retry: 3,
   *   shouldRetry: (error) => error.status !== 401
   * })
   * ```
   */
  shouldRetry?: (error: ApiError, attempt: number) => boolean
  /**
   * A function that returns the delay in milliseconds before the next retry attempt.
   * Receives the current attempt index (0-based). Defaults to exponential backoff
   * capped at 10 seconds: `Math.min(1000 * 2 ** attempt, 10000)`.
   *
   * @example
   * ```ts
   * handleApi('users', fetchUsers, {
   *   retry: 3,
   *   backoff: (attempt) => 500 * (attempt + 1)
   * })
   * ```
   */
  backoff?: (attempt: number) => number
  /**
   * If `true`, concurrent calls to the same key will share the existing in-flight
   * promise instead of starting a new request. Useful for preventing duplicate
   * network calls when multiple components request the same data simultaneously.
   */
  dedupe?: boolean
}

/**
 * A helper type used with {@link createApiComposer} to define a type-safe mapping
 * between API endpoint parameters and their response types.
 *
 * @typeParam P - The type of the request parameters.
 * @typeParam R - The type of the response data.
 *
 * @example
 * ```ts
 * interface MyApi {
 *   getUser: ApiEndpoint<{ id: number }, User>
 *   listPosts: ApiEndpoint<void, Post[]>
 * }
 * ```
 */
export interface ApiEndpoint<P, R> {
  params: P
  response: R
}

/**
 * The function signature for a middleware handler in the API middleware chain.
 * Each handler processes the API call and can modify behavior before/after passing to the next handler.
 *
 * @typeParam T - The response data type of the API call.
 */
export type ApiMiddlewareHandler = <T>(
  key: string,
  apiCall: () => Promise<{ data: T }>,
  options: ApiCallOptions<T>
) => Promise<void>

/**
 * A middleware function that wraps the next handler in the chain.
 * Middleware can intercept, modify, or short-circuit API calls.
 *
 * @example
 * ```ts
 * const loggingMiddleware: ApiMiddleware = (next) => async (key, apiCall, options) => {
 *   console.log(`[API] ${key} started`)
 *   await next(key, apiCall, options)
 *   console.log(`[API] ${key} finished`)
 * }
 *
 * useApiStore.getState().addMiddleware(loggingMiddleware)
 * ```
 */
export type ApiMiddleware = (next: ApiMiddlewareHandler) => ApiMiddlewareHandler

/**
 * The shape of the Zustand store that manages all API states.
 * This is the underlying store used by all hooks and the composer.
 *
 * The store uses `immer` middleware for immutable state updates and `persist` middleware
 * for optional `localStorage` persistence of selected keys.
 */
export interface ApiStore {
  /** A map of all tracked API states, keyed by their unique string identifier. */
  apiStates: Record<string, ApiState<unknown>>
  /** A map tracking which API keys should be persisted to `localStorage`. */
  persistentKeys: Record<string, boolean>
  /** The registered middleware functions applied to every `handleApi` call. */
  middleware: ApiMiddleware[]
  /** The registered global error handler callbacks. */
  errorHandlers: ((error: ApiError, key: string) => void)[]

  /**
   * Manually update the state for a given API key.
   *
   * @typeParam T - The response data type.
   * @param key - The unique identifier for the API endpoint.
   * @param state - A partial state to merge into the current state.
   * @param persist - If `true`, marks this key for `localStorage` persistence.
   */
  setApiState: <T>(key: string, state: Partial<ApiState<T>>, persist?: boolean) => void

  /**
   * Reset the state for a given API key back to its initial state and remove it from persistence.
   *
   * @param key - The unique identifier for the API endpoint to reset.
   */
  resetApiState: (key: string) => void

  /**
   * Mark a cached API key as stale by clearing its `fetchedAt` timestamp.
   * The existing data remains visible, but the next `handleApi` call with
   * `staleTime` will refetch instead of returning the cache.
   *
   * @param key - The unique identifier for the API endpoint to invalidate.
   */
  invalidateApi: (key: string) => void

  /**
   * Execute an API call with full lifecycle management: sets status to `LOADING`,
   * handles retries with exponential backoff, supports abort signals, runs through
   * the middleware chain, and updates the state to `SUCCESS` or `ERROR`.
   *
   * Returns the response data on success, or `undefined` if the request was
   * aborted, stale (superseded by a newer request), or failed.
   *
   * @typeParam T - The expected response data type.
   * @param key - The unique identifier for the API endpoint.
   * @param apiCall - A function that returns a promise resolving to `{ data: T }`.
   * @param options - Optional configuration for persistence, retries, abort, and callbacks.
   * @returns The response data on success, or `undefined` otherwise.
   */
  handleApi: <T>(
    key: string,
    apiCall: () => Promise<{ data: T }>,
    options?: ApiCallOptions<T>
  ) => Promise<T | undefined>

  /**
   * Start polling an API endpoint at a regular interval using `setInterval`.
   * Returns a function to stop polling.
   *
   * @typeParam T - The expected response data type.
   * @param key - The unique identifier for the API endpoint.
   * @param apiCall - A function that returns a promise resolving to `{ data: T }`.
   * @param interval - The polling interval in milliseconds.
   * @param options - Optional configuration passed to each `handleApi` call.
   * @returns A function to stop polling.
   *
   * @example
   * ```ts
   * const stop = useApiStore.getState().startPolling(
   *   'notifications',
   *   () => fetchNotifications(),
   *   10_000
   * )
   *
   * // Later, stop polling:
   * stop()
   * ```
   */
  startPolling: <T>(
    key: string,
    apiCall: () => Promise<{ data: T }>,
    interval: number,
    options?: ApiCallOptions<T>
  ) => () => void

  /**
   * Register a middleware function that will be applied to all subsequent `handleApi` calls.
   * Middleware is composed in registration order (first registered = outermost wrapper).
   *
   * @param middleware - The middleware function to add.
   * @returns A function to unsubscribe (remove) the middleware.
   */
  addMiddleware: (middleware: ApiMiddleware) => () => void

  /**
   * Register a global error handler that will be called whenever any API call fails.
   *
   * @param handler - A callback receiving the error and the API key that failed.
   * @returns A function to unsubscribe (remove) the error handler.
   */
  addErrorHandler: (handler: (error: ApiError, key: string) => void) => () => void
}

/**
 * Configuration options for creating an API store instance.
 */
export interface ApiStoreConfig {
  /** The localStorage key used for persistence. Defaults to `'api_store'`. */
  storageKey?: string
  /** A custom storage object (must implement getItem, setItem, removeItem). Defaults to localStorage (SSR-safe). */
  storage?: {
    getItem: (name: string) => string | null | Promise<string | null>
    setItem: (name: string, value: string) => void | Promise<void>
    removeItem: (name: string) => void | Promise<void>
  }
}

/**
 * The return type of {@link useApiHandler}.
 * Provides reactive access to the API state along with functions to trigger and reset.
 *
 * @typeParam T - The response data type.
 */
export interface ApiHandlerResult<T> {
  /** The response data, or `null` if not yet loaded or on error. */
  data: T | null
  /** The raw lifecycle status of the API request. */
  status: FetchStatus
  /** `true` if no request has been made yet for this key. */
  isIdle: boolean
  /** `true` if a request is currently in progress. */
  isLoading: boolean
  /** `true` if the last request completed successfully. */
  isSuccess: boolean
  /** `true` if the last request failed. */
  isError: boolean
  /** The error from the last failed request, or `null`. */
  error: ApiError | null
  /** Timestamp (ms since epoch) of the last successful fetch, or `null`. */
  fetchedAt: number | null
  /**
   * Trigger an API call for this endpoint.
   *
   * @param apiCall - A function that returns a promise resolving to `{ data: T }`.
   * @param options - Optional configuration for persistence, retries, abort, and callbacks.
   * @returns The response data on success, or `undefined` otherwise.
   */
  handleApi: (
    apiCall: () => Promise<{ data: T }>,
    options?: ApiCallOptions<T>
  ) => Promise<T | undefined>
  /** Reset this endpoint's state back to idle and remove it from persistence. */
  resetApi: () => void
  /** Mark this endpoint's cache as stale so the next call with `staleTime` will refetch. */
  invalidateApi: () => void
}

/**
 * The return type of the hook created by {@link createApiComposer}.
 * Provides reactive access to the API state along with a type-safe `handleApi` function.
 *
 * @typeParam T - The response data type.
 * @typeParam P - The request parameters type. Defaults to `void` (no params).
 */
export interface ApiComposerResult<T, P = void> {
  /** The response data, or `null` if not yet loaded or on error. */
  data: T | null
  /** The raw lifecycle status of the API request. */
  status: FetchStatus
  /** `true` if no request has been made yet for this key. */
  isIdle: boolean
  /** `true` if a request is currently in progress. */
  isLoading: boolean
  /** `true` if the last request completed successfully. */
  isSuccess: boolean
  /** `true` if the last request failed. */
  isError: boolean
  /** The error from the last failed request, or `null`. */
  error: ApiError | null
  /** Timestamp (ms since epoch) of the last successful fetch, or `null`. */
  fetchedAt: number | null
  /**
   * Trigger an API call for this endpoint. The `apiCall` function receives
   * the typed parameters and must return `{ data: T }`.
   *
   * @param params - The typed parameters for the API call.
   * @param apiCall - A function that accepts typed params and returns the response.
   * @param options - Optional configuration for persistence, retries, abort, and callbacks.
   * @returns The response data on success, or `undefined` otherwise.
   */
  handleApi: (
    ...args: P extends void
      ? [apiCall: (params: P) => Promise<{ data: T }>, options?: ApiCallOptions<T>]
      : [params: P, apiCall: (params: P) => Promise<{ data: T }>, options?: ApiCallOptions<T>]
  ) => Promise<T | undefined>
  /** Reset this endpoint's state back to idle and remove it from persistence. */
  resetApi: () => void
  /** Mark this endpoint's cache as stale so the next call with `staleTime` will refetch. */
  invalidateApi: () => void
}
