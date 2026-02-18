import { useEffect } from 'react'
import { getGlobalConfig } from './config'
import { onWindowFocus, onReconnect } from './focusManager'
import { FetchStatus, type ApiCallOptions, type ApiStore } from './types'
import { compositeKey } from './utils'
import type { QueryTracker } from './queryTracker'
import type { StoreApi, UseBoundStore } from 'zustand'

/** Keys excluded when forwarding declarative options to ApiCallOptions. */
const DECLARATIVE_ONLY_KEYS = new Set([
  'params', 'enabled', 'signal', 'optimisticData', 'polling',
  'refetchOnWindowFocus', 'refetchOnReconnect', 'gcTime'
])

/** Extract ApiCallOptions from a declarative options record. */
export function extractApiOptions(opts: Record<string, unknown> | undefined): ApiCallOptions<unknown> {
  if (!opts) return {}
  const apiOptions: Record<string, unknown> = {}
  for (const k of Object.keys(opts)) {
    if (!DECLARATIVE_ONLY_KEYS.has(k)) {
      apiOptions[k] = opts[k]
    }
  }
  return apiOptions as ApiCallOptions<unknown>
}

/** Setup focus/reconnect subscriptions based on declarative options. */
export function setupFocusReconnect(
  refetchFn: () => void,
  opts: Record<string, unknown> | undefined
): (() => void)[] {
  const cleanups: (() => void)[] = []
  const globalCfg = getGlobalConfig()
  if ((opts?.refetchOnWindowFocus as boolean | undefined) ?? globalCfg.defaultRefetchOnWindowFocus) {
    cleanups.push(onWindowFocus(refetchFn))
  }
  if ((opts?.refetchOnReconnect as boolean | undefined) ?? globalCfg.defaultRefetchOnReconnect) {
    cleanups.push(onReconnect(refetchFn))
  }
  return cleanups
}

interface UseDeclarativeEffectConfig {
  key: string
  params: unknown
  serializedParams: string
  enabled: boolean
  isDeclarativeMode: boolean
  useStore: UseBoundStore<StoreApi<ApiStore>>
  tracker: QueryTracker
  declarativeOptionsRef: { readonly current: unknown }
  /** Additional guard: return false to skip the effect (e.g. check that queryFn ref is set). */
  guard: () => boolean
  /** Create the fetch function used for initial fetch and tracker registration. */
  makeFetchFn: (cacheKey: string, params: unknown) => () => Promise<unknown>
  /** Create the refetch function for focus/reconnect. Defaults to wrapping fetchFn. */
  makeRefetchFn?: (key: string, cacheKey: string) => () => void
  /** Create the polling tick function. Defaults to LOADING-guard + fetchFn. */
  makePollingTickFn?: (cacheKey: string, fetchFn: () => Promise<unknown>) => () => void
}

/**
 * Shared declarative auto-fetch effect for both regular and infinite query endpoints.
 * Handles: tracker registration, initial fetch, focus/reconnect, polling, and cleanup.
 */
export function useDeclarativeEffect(cfg: UseDeclarativeEffectConfig) {
  const {
    key, params, serializedParams, enabled, isDeclarativeMode,
    useStore, tracker, declarativeOptionsRef,
    guard, makeFetchFn, makeRefetchFn, makePollingTickFn
  } = cfg

  useEffect(() => {
    if (!isDeclarativeMode || !enabled || !guard()) return

    const cacheKey = compositeKey(key, params)
    const opts = declarativeOptionsRef.current as Record<string, unknown> | undefined
    const gcTime = tracker.resolveGcTime(opts)

    const fetchFn = makeFetchFn(cacheKey, params)

    tracker.register(key, cacheKey, params, gcTime, fetchFn)
    fetchFn()

    // Focus/reconnect subscriptions
    const refetchFn = makeRefetchFn
      ? makeRefetchFn(key, cacheKey)
      : () => { fetchFn() }
    const cleanups = setupFocusReconnect(refetchFn, opts)

    // Polling support
    const pollingInterval = (declarativeOptionsRef.current as { polling?: number } | undefined)?.polling

    if (pollingInterval && pollingInterval > 0) {
      const tick = makePollingTickFn
        ? makePollingTickFn(cacheKey, fetchFn)
        : () => {
            const currentState = useStore.getState().apiStates[cacheKey]
            if (currentState?.status === FetchStatus.LOADING) return
            fetchFn()
          }

      const intervalId = setInterval(tick, pollingInterval)
      return () => {
        tracker.unregister(key, cacheKey)
        clearInterval(intervalId)
        cleanups.forEach(fn => fn())
      }
    }

    return () => {
      tracker.unregister(key, cacheKey)
      cleanups.forEach(fn => fn())
    }
  }, [key, serializedParams, enabled, isDeclarativeMode, useStore])
}
