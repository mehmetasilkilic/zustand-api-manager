import type { StoreApi, UseBoundStore } from 'zustand'
import type { ApiCallOptions, ApiStore, MutationEndpointConfig } from './types'
import type { QueryTracker } from './queryTracker'

/** Internal normalized shape for every mutation endpoint. */
export interface NormalizedMutation {
  fn: (variables: unknown) => Promise<unknown>
  invalidates: string[]
  optimistic: Record<string, (variables: unknown, currentData: unknown) => unknown>
}

/** Normalize a bare function or MutationEndpointConfig into a consistent shape. */
export function normalizeMutation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry: ((variables: unknown) => Promise<unknown>) | MutationEndpointConfig<any, any, any>
): NormalizedMutation {
  if (typeof entry === 'function') {
    return { fn: entry, invalidates: [], optimistic: {} }
  }
  return {
    fn: entry.fn as (variables: unknown) => Promise<unknown>,
    invalidates: (entry.invalidates ?? []) as string[],
    optimistic: (entry.optimistic ?? {}) as Record<
      string,
      (variables: unknown, currentData: unknown) => unknown
    >
  }
}

/** Execute a mutation with optimistic updates, invalidation, and rollback. */
export function executeMutation(
  useStore: UseBoundStore<StoreApi<ApiStore>>,
  key: string,
  variables: unknown,
  options: ApiCallOptions<unknown> | undefined,
  mutationFnRef: { current: ((variables: unknown) => Promise<unknown>) | undefined },
  normalizedMutation: NormalizedMutation,
  tracker: QueryTracker,
  queries: Record<string, ((params: unknown) => Promise<unknown>) | undefined> | undefined
) {
  const store = useStore.getState()
  const { invalidates, optimistic } = normalizedMutation

  // ── Cross-endpoint optimistic updates (broadcast to composite keys) ──
  const snapshots = new Map<string, unknown>()
  const optimisticKeys = Object.keys(optimistic)

  if (optimisticKeys.length > 0) {
    for (const qKey of optimisticKeys) {
      const updater = optimistic[qKey]
      if (!updater) continue

      const compositeKeys = tracker.activeKeysByEndpoint.get(qKey)
      if (compositeKeys) {
        for (const ck of compositeKeys) {
          const currentState = store.apiStates[ck]
          const currentData = currentState?.data ?? null
          snapshots.set(ck, currentData)
          const newData = updater(variables, currentData)
          store.setApiState(ck, { data: newData })
        }
      } else {
        const currentState = store.apiStates[qKey]
        const currentData = currentState?.data ?? null
        snapshots.set(qKey, currentData)
        const newData = updater(variables, currentData)
        store.setApiState(qKey, { data: newData })
      }
    }
  }

  // ── Execute the mutation via handleApi ──
  const userOnSuccess = options?.onSuccess
  const userOnError = options?.onError

  const wrappedOptions: ApiCallOptions<unknown> = {
    ...options,
    onSuccess: (data: unknown) => {
      if (invalidates.length > 0) {
        const keysToInvalidate: string[] = [...invalidates]

        for (const endpoint of invalidates) {
          const composites = tracker.activeKeysByEndpoint.get(endpoint)
          if (composites) {
            keysToInvalidate.push(...composites)
          }
        }

        store.invalidateApis(keysToInvalidate)

        for (const endpoint of invalidates) {
          const composites = tracker.activeKeysByEndpoint.get(endpoint)
          if (composites) {
            for (const ck of composites) {
              const active = tracker.activeQueries.get(ck)
              if (active?.refetchFn) {
                active.refetchFn()
              } else {
                const boundFn = queries?.[endpoint]
                if (active && boundFn) {
                  store.handleApi(ck, () => boundFn(active.params))
                }
              }
            }
          }
        }
      }

      userOnSuccess?.(data)
    },
    onError: (error) => {
      if (snapshots.size > 0) {
        for (const [ck, previousData] of snapshots) {
          store.setApiState(ck, { data: previousData })
        }
      }

      userOnError?.(error)
    }
  }

  return store.handleApi(
    key,
    () => mutationFnRef.current!(variables),
    wrappedOptions
  )
}
