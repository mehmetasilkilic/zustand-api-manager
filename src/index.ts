import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";
import {
  ApiCallOptions,
  ApiComposerResult,
  ApiEndpoint,
  ApiError,
  ApiState,
  ApiStore,
  FetchStatus,
} from "./types";

export * from "./types";

const initialApiState: ApiState<unknown> = {
  status: FetchStatus.IDLE,
  data: null,
  error: null,
};

const STORAGE_KEY = "api_store";

export { enableMapSet };

export const useApiStore = create<ApiStore>()(
  persist(
    immer((set, get) => ({
      apiStates: {},
      persistentKeys: new Set<string>(),
      middleware: [],
      errorHandlers: [],

      setApiState: <T>(
        key: string,
        state: Partial<ApiState<T>>, // Always an object
        persist = false
      ) =>
        set((draft) => {
          if (!draft.apiStates[key]) {
            // Initialize the state if it doesn't exist yet
            draft.apiStates[key] = { ...initialApiState } as ApiState<T>;
          }

          // Directly merge the incoming state deeply into the previous state
          const prevState = draft.apiStates[key] as ApiState<T>;
          Object.assign(prevState, state); // Immer ensures deep immutability

          // Handle persistence if needed
          if (persist) {
            draft.persistentKeys.add(key);
          } else {
            draft.persistentKeys.delete(key);
          }
        }),

      resetApiState: (key: string) =>
        set((draft) => {
          delete draft.apiStates[key];
          draft.persistentKeys.delete(key);
        }),

      handleApi: async <T, P = void>(
        key: string,
        apiCall: (params: P) => Promise<{ data: T }>,
        options: ApiCallOptions<T> = {}
      ) => {
        const { setApiState, errorHandlers, middleware } = get();

        const handleError = (error: ApiError) => {
          setApiState<T>(
            key,
            {
              status: FetchStatus.ERROR,
              error,
              data: null,
            },
            options.persist
          );
          errorHandlers.forEach((handler) => handler(error, key));
          options.onError?.();
        };

        const composedMiddleware = middleware.reduce<any>(
          (acc, mid) => mid(acc),
          async <U>(
            key: string,
            apiCall: () => Promise<{ data: U }>,
            options: ApiCallOptions<U>
          ) => {
            setApiState<U>(
              key,
              { status: FetchStatus.LOADING },
              options.persist
            );
            try {
              const response = await apiCall();

              setApiState<U>(
                key,
                {
                  status: FetchStatus.SUCCESS,
                  data: response.data,
                  error: null,
                },
                options.persist
              );

              options.onSuccess?.();
            } catch (error) {
              const apiError: ApiError =
                error instanceof Error
                  ? error
                  : new Error("An unknown error occurred");
              if (error && typeof error === "object" && "status" in error) {
                apiError.status = error.status as number;
              }
              if (error && typeof error === "object" && "code" in error) {
                apiError.code = error.code as string;
              }
              console.log("apiError", apiError);

              handleError(apiError);
            }
          }
        );

        await composedMiddleware(key, apiCall, options);
      },

      addMiddleware: (middleware) =>
        set((state) => ({ middleware: [...state.middleware, middleware] })),

      addErrorHandler: (handler) =>
        set((state) => ({ errorHandlers: [...state.errorHandlers, handler] })),
    })),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        apiStates: Object.fromEntries(
          Object.entries(state.apiStates).filter(([key]) =>
            state.persistentKeys.has(key)
          )
        ),
        persistentKeys: Array.from(state.persistentKeys),
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error("Error rehydrating state:", error);
          } else if (state) {
            // Convert persistentKeys back to a Set
            state.persistentKeys = new Set(state.persistentKeys);
          }
        };
      },
    }
  )
);

// Direct hook for getLoadingStates
export const getLoadingStates = (keys?: string | string[]): boolean => {
  const { apiStates } = useApiStore();
  if (!keys) {
    // If no keys are provided, check if any state is loading
    return Object.values(apiStates).some(
      (state) => state.status === FetchStatus.LOADING
    );
  }
  const keyArray = Array.isArray(keys) ? keys : [keys];
  // Check if any of the specified keys are loading
  return keyArray.some((key) => apiStates[key]?.status === FetchStatus.LOADING);
};

// Updated API Handler
export const useApiHandler = <T, P = void>(key: string) => {
  const { apiStates, handleApi, resetApiState } = useApiStore();

  const apiState = apiStates[key] as ApiState<T> | undefined;

  return {
    isLoading: apiState?.status === FetchStatus.LOADING,
    isError: apiState?.status === FetchStatus.ERROR,
    isSuccess: apiState?.status === FetchStatus.SUCCESS,
    data: apiState?.data,
    error: apiState?.error,
    handleApi: (
      apiCall: (params: P) => Promise<{ data: T }>,
      options?: ApiCallOptions<T>
    ) => handleApi(key, apiCall, options),
    resetApi: () => resetApiState(key),
  };
};

export function createApiComposer<
  TApiStructure extends Record<string, ApiEndpoint<any, any>>
>() {
  return function useApiComposer<K extends keyof TApiStructure>(
    key: K
  ): ApiComposerResult<
    TApiStructure[K]["response"],
    TApiStructure[K]["params"]
  > {
    const { apiStates, handleApi } = useApiStore();

    const apiState = apiStates[key as string] as
      | ApiState<TApiStructure[K]["response"]>
      | undefined;

    return {
      data: apiState?.data ?? null,
      isLoading: apiState?.status === FetchStatus.LOADING,
      isSuccess: apiState?.status === FetchStatus.SUCCESS,
      isError: apiState?.status === FetchStatus.ERROR,
      error: apiState?.error ?? null,
      handleApi: (
        apiCall: (
          params: TApiStructure[K]["params"]
        ) => Promise<{ data: TApiStructure[K]["response"] }>,
        options?: ApiCallOptions<TApiStructure[K]["response"]>
      ) => handleApi(key as string, apiCall, options),
    };
  };
}
