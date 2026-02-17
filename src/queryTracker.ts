import { getGlobalConfig } from './config'

/** Default GC time: 5 minutes (matches React Query). */
const DEFAULT_GC_TIME = 300_000

export interface ActiveQueryEntry {
  endpoint: string
  params: unknown
  gcTime: number
  refCount: number
  refetchFn?: () => Promise<unknown>
}

/**
 * Tracks active (mounted) declarative queries for a single composer instance.
 * Manages reference counting, garbage collection timers, and endpoint→key mappings
 * used by automatic cache invalidation.
 *
 * @internal Not part of the public API.
 */
export class QueryTracker {
  /** Active queries keyed by composite cache key (e.g. `"getUser::{"id":1}"`). */
  readonly activeQueries = new Map<string, ActiveQueryEntry>()

  /** Bare endpoint name → set of active composite cache keys. */
  readonly activeKeysByEndpoint = new Map<string, Set<string>>()

  /** GC timers keyed by composite cache key. */
  private gcTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /**
   * @param onGcExpired - Called when a GC timer fires for a cache key. Typically
   *   resets the store entry for that key.
   */
  constructor(private onGcExpired: (cacheKey: string) => void) {}

  /**
   * Register a query as active (mounted). Increments the ref count if the
   * same cache key is already active. Cancels any pending GC timer for the key.
   */
  register(
    endpoint: string,
    cacheKey: string,
    params: unknown,
    gcTime: number,
    refetchFn?: () => Promise<unknown>
  ): void {
    // Cancel any pending GC timer (query re-mounted before GC fired)
    const existingTimer = this.gcTimers.get(cacheKey)
    if (existingTimer != null) {
      clearTimeout(existingTimer)
      this.gcTimers.delete(cacheKey)
    }

    const existing = this.activeQueries.get(cacheKey)
    if (existing) {
      existing.refCount++
      existing.refetchFn = refetchFn
    } else {
      this.activeQueries.set(cacheKey, {
        endpoint,
        params,
        gcTime,
        refCount: 1,
        refetchFn
      })
    }

    let keys = this.activeKeysByEndpoint.get(endpoint)
    if (!keys) {
      keys = new Set()
      this.activeKeysByEndpoint.set(endpoint, keys)
    }
    keys.add(cacheKey)
  }

  /**
   * Unregister a query (unmounted). Decrements the ref count and, once zero,
   * removes tracking entries and starts a GC timer if configured.
   */
  unregister(endpoint: string, cacheKey: string): void {
    const entry = this.activeQueries.get(cacheKey)
    if (entry) {
      entry.refCount--
      if (entry.refCount > 0) return // Other components still using this query
    }

    this.activeQueries.delete(cacheKey)
    const keys = this.activeKeysByEndpoint.get(endpoint)
    if (keys) {
      keys.delete(cacheKey)
      if (keys.size === 0) this.activeKeysByEndpoint.delete(endpoint)
    }

    // Start GC timer if applicable
    const gcTime = entry?.gcTime ?? DEFAULT_GC_TIME
    if (gcTime > 0 && gcTime !== Infinity) {
      const timer = setTimeout(() => {
        this.gcTimers.delete(cacheKey)
        this.onGcExpired(cacheKey)
      }, gcTime)
      this.gcTimers.set(cacheKey, timer)
    }
  }

  /** Resolve the effective gcTime from per-query options or the global config. */
  resolveGcTime(opts: Record<string, unknown> | undefined): number {
    const local = opts?.gcTime as number | undefined
    if (local != null) return local
    const global = getGlobalConfig().defaultGcTime
    if (global != null) return global
    return DEFAULT_GC_TIME
  }
}

