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
 * Configuration options passed to `query()` or `store.handleApi()` to customize the behavior of an API call.
 *
 * @typeParam T - The expected response data type (used for typed `onSuccess` and `optimisticData`).
 *
 * @example
 * ```ts
 * const controller = new AbortController()
 *
 * query(() => fetchUsers(), {
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
  /** Callback invoked when the API call starts (before any cache check or network request). */
  onStart?: () => void
  /** Callback invoked when cached data is returned (staleTime hit). Receives the cached data. */
  onCacheHit?: (data: T) => void
  /** Callback invoked when the API call succeeds. Receives the typed response data. */
  onSuccess?: (data: T) => void
  /** Callback invoked when the API call fails (after all retries are exhausted). Receives the error. */
  onError?: (error: ApiError) => void
  /** Callback invoked before each retry attempt. Receives the error and the attempt number (0-based). */
  onBeforeRetry?: (error: ApiError, attempt: number) => void
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
   * When `true`, stale data will be returned immediately while a background revalidation
   * is triggered. This implements the stale-while-revalidate pattern for better UX.
   * Only works when data exists and `staleTime` has expired.
   *
   * @example
   * ```ts
   * query(() => fetchUser(), {
   *   staleTime: 30_000,
   *   revalidateOnStale: true // Return stale data instantly, refetch in background
   * })
   * ```
   */
  revalidateOnStale?: boolean
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
   * query(() => fetchUsers(), {
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
   * query(() => fetchUsers(), {
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
  /**
   * If `true`, the returned promise will reject with the `ApiError` instead of
   * resolving to `undefined` on failure. This enables `try/catch` patterns where
   * the caller can handle errors inline.
   *
   * @example
   * ```ts
   * try {
   *   const data = await query(() => fetchUsers(), { throwOnError: true })
   *   // data is guaranteed non-undefined here
   * } catch (error) {
   *   console.error('Request failed:', error)
   * }
   * ```
   */
  throwOnError?: boolean
}

/**
 * Defines a query endpoint (GET, read operations) for use with {@link createApiComposer}.
 * Query endpoints use the `query` method and support caching with `staleTime`.
 *
 * @typeParam P - The type of the request parameters.
 * @typeParam R - The type of the response data.
 *
 * @example
 * ```ts
 * interface MyApi {
 *   getUser: ApiQueryEndpoint<{ id: number }, User>
 *   listPosts: ApiQueryEndpoint<void, Post[]>
 * }
 * ```
 */
export interface ApiQueryEndpoint<P, R> {
  _type: 'query'
  params: P
  response: R
}

/**
 * Defines a mutation endpoint (POST, PUT, DELETE, PATCH) for use with {@link createApiComposer}.
 * Mutation endpoints use the `mutate` pattern and bind the mutation function at composer creation.
 *
 * @typeParam V - The type of the variables/payload.
 * @typeParam R - The type of the response data.
 *
 * @example
 * ```ts
 * interface MyApi {
 *   createUser: ApiMutationEndpoint<CreateUserPayload, User>
 *   updatePost: ApiMutationEndpoint<UpdatePostPayload, Post>
 * }
 * ```
 */
export interface ApiMutationEndpoint<V, R> {
  _type: 'mutation'
  variables: V
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
  /** The registered middleware functions applied to every API call. */
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
   * The existing data remains visible, but the next API call with
   * `staleTime` will refetch instead of returning the cache.
   *
   * @param key - The unique identifier for the API endpoint to invalidate.
   */
  invalidateApi: (key: string) => void

  /**
   * Batch-invalidate multiple cached API keys in a single state update.
   * Clears `fetchedAt` for each key while preserving existing data and status.
   *
   * @param keys - An array of API endpoint identifiers to invalidate.
   *
   * @example
   * ```ts
   * // Invalidate all user-related caches at once
   * useApiStore.getState().invalidateApis(['getUser', 'getUserPosts', 'getUserSettings'])
   * ```
   */
  invalidateApis: (keys: string[]) => void

  /**
   * Batch-reset multiple API keys back to their initial state in a single state update.
   * Removes all data, errors, and persistence for each key.
   *
   * @param keys - An array of API endpoint identifiers to reset.
   *
   * @example
   * ```ts
   * // Clear all user-related state on logout
   * useApiStore.getState().resetApiStates(['getUser', 'getUserPosts', 'getUserSettings'])
   * ```
   */
  resetApiStates: (keys: string[]) => void

  /**
   * Reset all API states back to their initial state. Clears every tracked key,
   * removes all persistence, and cleans up internal tracking maps.
   * Useful for a full cleanup on logout or app reset.
   *
   * @example
   * ```ts
   * useApiStore.getState().resetAll()
   * ```
   */
  resetAll: () => void

  /**
   * Invalidate all cached API keys in a single state update.
   * Clears `fetchedAt` for every key while preserving existing data and status.
   * The next API call with `staleTime` will refetch.
   *
   * @example
   * ```ts
   * useApiStore.getState().invalidateAll()
   * ```
   */
  invalidateAll: () => void

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
   * Register a middleware function that will be applied to all subsequent API calls.
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

  /**
   * Cancel all in-flight requests across all API keys.
   * Each request will transition to ERROR state with code 'ABORT_ERR'.
   *
   * @example
   * ```ts
   * // Cancel all requests (useful on logout or navigation)
   * useApiStore.getState().cancelAll()
   * ```
   */
  cancelAll: () => void

  /**
   * Cancel a specific in-flight request by its key.
   * The request will transition to ERROR state with code 'ABORT_ERR'.
   *
   * @param key - The unique identifier for the API endpoint to cancel.
   *
   * @example
   * ```ts
   * useApiStore.getState().cancelRequest('users')
   * ```
   */
  cancelRequest: (key: string) => void
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
  /** Enable Zustand DevTools for debugging. Defaults to `false`. Only works in development environments. */
  enableDevtools?: boolean
  /** Custom name for the DevTools instance. Defaults to the storageKey value. */
  devtoolsName?: string
}

/**
 * The return type of {@link useApiQuery}.
 * Provides reactive access to the API state along with functions to trigger and reset.
 *
 * @typeParam T - The response data type.
 */
export interface ApiQueryResult<T> {
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
  query: (
    apiCall: () => Promise<{ data: T }>,
    options?: ApiCallOptions<T>
  ) => Promise<T | undefined>
  /** Reset this endpoint's state back to idle and remove it from persistence. */
  reset: () => void
  /** Mark this endpoint's cache as stale so the next call with `staleTime` will refetch. */
  invalidate: () => void
}

/**
 * @deprecated Use {@link ApiQueryResult} instead. Will be removed in a future version.
 */
export type ApiHandlerResult<T> = ApiQueryResult<T>

/**
 * The return type of {@link useApiMutation}.
 * Provides reactive access to mutation state with a `mutate` function optimized for write operations.
 *
 * @typeParam T - The response data type.
 * @typeParam V - The variables/payload type passed to the mutation.
 */
export interface ApiMutationResult<T, V = void> {
  /** The response data from the last successful mutation, or `null`. */
  data: T | null
  /** The raw lifecycle status of the mutation. */
  status: FetchStatus
  /** `true` if no mutation has been called yet for this key. */
  isIdle: boolean
  /** `true` if a mutation is currently in progress. */
  isLoading: boolean
  /** `true` if the last mutation completed successfully. */
  isSuccess: boolean
  /** `true` if the last mutation failed. */
  isError: boolean
  /** The error from the last failed mutation, or `null`. */
  error: ApiError | null
  /**
   * Trigger a mutation with the given variables/payload.
   *
   * @param variables - The payload to pass to the mutation function.
   * @param options - Optional configuration for persistence, retries, abort, and callbacks.
   * @returns The response data on success, or `undefined` otherwise.
   */
  mutate: (
    ...args: V extends void
      ? [options?: ApiCallOptions<T>]
      : [variables: V, options?: ApiCallOptions<T>]
  ) => Promise<T | undefined>
  /** Reset this mutation's state back to idle. */
  reset: () => void
}

/**
 * Configuration for {@link createApiComposer} to bind mutation functions.
 * Pass mutation functions for each mutation endpoint in your API structure.
 *
 * @typeParam TApiStructure - The API structure interface.
 *
 * @example
 * ```ts
 * const config: ApiComposerConfig<MyApi> = {
 *   mutations: {
 *     createUser: (payload) => api.createUser(payload),
 *     updatePost: (payload) => api.updatePost(payload)
 *   }
 * }
 * ```
 */
export interface ApiComposerConfig<TApiStructure> {
  mutations?: {
    [K in keyof TApiStructure]?: TApiStructure[K] extends ApiMutationEndpoint<infer V, infer R>
      ? (variables: V) => Promise<{ data: R }>
      : never
  }
}

/**
 * Result type for query endpoints in the composer.
 * Returned when accessing a query endpoint via the composed hook.
 *
 * @typeParam R - The response data type.
 * @typeParam P - The request parameters type.
 */
export interface ApiComposerQueryResult<R, P = void> {
  data: R | null
  status: FetchStatus
  isIdle: boolean
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  error: ApiError | null
  fetchedAt: number | null
  query: (
    ...args: P extends void
      ? [apiCall: (params: P) => Promise<{ data: R }>, options?: ApiCallOptions<R>]
      : [params: P, apiCall: (params: P) => Promise<{ data: R }>, options?: ApiCallOptions<R>]
  ) => Promise<R | undefined>
  reset: () => void
  invalidate: () => void
}

/**
 * Result type for mutation endpoints in the composer.
 * Returned when accessing a mutation endpoint via the composed hook.
 *
 * @typeParam R - The response data type.
 * @typeParam V - The variables/payload type.
 */
export interface ApiComposerMutationResult<R, V = void> {
  data: R | null
  status: FetchStatus
  isIdle: boolean
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  error: ApiError | null
  mutate: (
    ...args: V extends void
      ? [options?: ApiCallOptions<R>]
      : [variables: V, options?: ApiCallOptions<R>]
  ) => Promise<R | undefined>
  reset: () => void
}
