import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { initialApiState, STORAGE_KEY } from './constants'
import {
  ApiCallOptions,
  ApiError,
  ApiMiddlewareHandler,
  ApiState,
  ApiStore,
  FetchStatus
} from './types'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const useApiStore = create<ApiStore>()(
  persist(
    immer((set, get) => ({
      apiStates: {},
      persistentKeys: {} as Record<string, boolean>,
      middleware: [],
      errorHandlers: [],

      setApiState: <T>(key: string, state: Partial<ApiState<T>>, shouldPersist = false) =>
        set(draft => {
          if (!draft.apiStates[key]) {
            draft.apiStates[key] = { ...initialApiState } as ApiState<T>
          }

          const prevState = draft.apiStates[key] as ApiState<T>
          Object.assign(prevState, state)

          if (shouldPersist) {
            draft.persistentKeys[key] = true
          } else {
            delete draft.persistentKeys[key]
          }
        }),

      resetApiState: (key: string) =>
        set(draft => {
          delete draft.apiStates[key]
          delete draft.persistentKeys[key]
        }),

      handleApi: async <T>(
        key: string,
        apiCall: () => Promise<{ data: T }>,
        options: ApiCallOptions = {}
      ) => {
        const { setApiState, errorHandlers, middleware } = get()
        const { retry = 0 } = options

        const handleError = (error: ApiError) => {
          setApiState<T>(key, { status: FetchStatus.ERROR, error, data: null }, options.persist)
          errorHandlers.forEach(handler => handler(error, key))
          options.onError?.()
        }

        const baseHandler: ApiMiddlewareHandler = async (key, apiCall, options) => {
          setApiState(key, { status: FetchStatus.LOADING }, options.persist)

          let lastError: ApiError | undefined
          const maxAttempts = (options.retry ?? 0) + 1

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (options.signal?.aborted) {
              const abortError: ApiError = new Error('Aborted')
              abortError.code = 'ABORT_ERR'
              handleError(abortError)
              return
            }

            try {
              const response = await apiCall()
              setApiState(
                key,
                { status: FetchStatus.SUCCESS, data: response.data, error: null },
                options.persist
              )
              options.onSuccess?.()
              return
            } catch (error) {
              if (options.signal?.aborted) {
                const abortError: ApiError = new Error('Aborted')
                abortError.code = 'ABORT_ERR'
                handleError(abortError)
                return
              }

              const apiError: ApiError =
                error instanceof Error ? error : new Error('An unknown error occurred')
              if (error && typeof error === 'object' && 'status' in error) {
                apiError.status = error.status as number
              }
              if (error && typeof error === 'object' && 'code' in error) {
                apiError.code = error.code as string
              }
              lastError = apiError

              if (attempt < maxAttempts - 1) {
                await sleep(Math.min(1000 * 2 ** attempt, 10000))
              }
            }
          }

          if (lastError) {
            handleError(lastError)
          }
        }

        const composedHandler = middleware.reduce<ApiMiddlewareHandler>(
          (next, mid) => mid(next),
          baseHandler
        )

        await composedHandler(key, apiCall, { ...options, retry })
      },

      addMiddleware: middleware =>
        set(state => ({ middleware: [...state.middleware, middleware] })),

      addErrorHandler: handler =>
        set(state => ({
          errorHandlers: [...state.errorHandlers, handler]
        }))
    })),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        apiStates: Object.fromEntries(
          Object.entries(state.apiStates).filter(([key]) => state.persistentKeys[key])
        ),
        persistentKeys: state.persistentKeys
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('Error rehydrating state:', error)
        }
      }
    }
  )
)
