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

export const useApiStore = create<ApiStore>()(
  persist(
    immer((set, get) => ({
      apiStates: {},
      persistentKeys: new Set<string>(),
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
            draft.persistentKeys.add(key)
          } else {
            draft.persistentKeys.delete(key)
          }
        }),

      resetApiState: (key: string) =>
        set(draft => {
          delete draft.apiStates[key]
          draft.persistentKeys.delete(key)
        }),

      handleApi: async <T, P = void>(
        key: string,
        apiCall: (params: P) => Promise<{ data: T }>,
        options: ApiCallOptions = {}
      ) => {
        const { setApiState, errorHandlers, middleware } = get()

        const handleError = (error: ApiError) => {
          setApiState<T>(key, { status: FetchStatus.ERROR, error, data: null }, options.persist)
          errorHandlers.forEach(handler => handler(error, key))
          options.onError?.()
        }

        const baseHandler: ApiMiddlewareHandler = async (key, apiCall, options) => {
          setApiState(key, { status: FetchStatus.LOADING }, options.persist)
          try {
            const response = await apiCall()
            setApiState(
              key,
              { status: FetchStatus.SUCCESS, data: response.data, error: null },
              options.persist
            )
            options.onSuccess?.()
          } catch (error) {
            const apiError: ApiError =
              error instanceof Error ? error : new Error('An unknown error occurred')
            if (error && typeof error === 'object' && 'status' in error) {
              apiError.status = error.status as number
            }
            if (error && typeof error === 'object' && 'code' in error) {
              apiError.code = error.code as string
            }
            handleError(apiError)
          }
        }

        const composedHandler = middleware.reduce<ApiMiddlewareHandler>(
          (next, mid) => mid(next),
          baseHandler
        )

        await composedHandler(key, apiCall as () => Promise<{ data: T }>, options)
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
          Object.entries(state.apiStates).filter(([key]) => state.persistentKeys.has(key))
        ),
        persistentKeys: Array.from(state.persistentKeys)
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Error rehydrating state:', error)
        } else if (state) {
          state.persistentKeys = new Set(state.persistentKeys)
        }
      }
    }
  )
)
