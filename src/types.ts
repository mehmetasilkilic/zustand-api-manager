export enum FetchStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface ApiState<T> {
  status: FetchStatus
  data: T | null
  error: ApiError | null
}

export interface ApiError extends Error {
  status?: number
  code?: string
}

export interface ApiCallOptions {
  onSuccess?: () => void
  onError?: () => void
  persist?: boolean
}

export interface ApiEndpoint<P, R> {
  params: P
  response: R
}

export type ApiMiddlewareHandler = <T>(
  key: string,
  apiCall: () => Promise<{ data: T }>,
  options: ApiCallOptions
) => Promise<void>

export type ApiMiddleware = (next: ApiMiddlewareHandler) => ApiMiddlewareHandler

export interface ApiStore {
  apiStates: Record<string, ApiState<unknown>>
  persistentKeys: Set<string>
  middleware: ApiMiddleware[]
  errorHandlers: ((error: ApiError, key: string) => void)[]
  setApiState: <T>(key: string, state: Partial<ApiState<T>>, persist?: boolean) => void
  resetApiState: (key: string) => void
  handleApi: <T, P = void>(
    key: string,
    apiCall: (params: P) => Promise<{ data: T }>,
    options?: ApiCallOptions
  ) => Promise<void>
  addMiddleware: (middleware: ApiMiddleware) => void
  addErrorHandler: (handler: (error: ApiError, key: string) => void) => void
}

export interface ApiComposerResult<T, P = void> {
  data: T | null
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  error: ApiError | null
  handleApi: (
    apiCall: (params: P) => Promise<{ data: T }>,
    options?: ApiCallOptions
  ) => Promise<void>
}
