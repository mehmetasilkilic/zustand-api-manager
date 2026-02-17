# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.1.0] - 2026-02-17

### Added
- Composite cache keys for parameterized queries (`getUser::{"id":1}`)
- Infinite query support with `ApiInfiniteQueryEndpoint`, `fetchNextPage`, `hasNextPage`, and `isFetchingNextPage`
- Static `prefetch` method on composer for preloading data outside components
- Garbage collection for unmounted query caches (`gcTime` option)
- Refetch on window focus (`refetchOnWindowFocus`) and network reconnect (`refetchOnReconnect`)
- Declarative polling via `polling` option on queries
- `isFetching` vs `isLoading` distinction (background refetches vs first load)
- Active query tracking with automatic refetch on invalidation
- `focusManager` module with lazy DOM listener setup/teardown

### Changed
- Composer is now the primary API — one hook for your entire API surface
- Invalidation broadcasts to all composite keys for an endpoint
- Optimistic updates broadcast to all active composite keys
- `useLoadingStates` now supports prefix-aware composite key matching

## [3.0.0] - 2026-02-16

### Breaking Changes
- Composer (`createApiComposer`) is now the recommended entry point
- Declarative auto-fetching: pass a second arg to trigger fetch on mount and when params change
- Observer mode: omit the second arg to read cached state without triggering a fetch

### Added
- Declarative auto-fetching mode for query endpoints
- Bound query functions at composer creation (no need to pass `apiCall` at call site)
- `enabled` pattern for dependent/conditional queries
- Stable function references (`query`, `reset`, `invalidate`, `mutate`) via `useCallback`

## [2.0.0] - 2026-02-12

### Breaking Changes
- **Renamed `useApiHandler` to `useApiQuery`** for better clarity and consistency with `useApiMutation`
  - Migration: Simply find-and-replace `useApiHandler` with `useApiQuery` in your codebase

- **`createApiComposer` query endpoints renamed methods for consistency:**
  - `handleApi` → `query` (execute the query)
  - `resetApi` → `reset` (reset the state)
  - `invalidateApi` → `invalidate` (invalidate the cache)

### Added
- DevTools integration for better debugging experience
- `useApiMutation` hook for better mutation semantics
- Global configuration support via `configureApiStore`
- Extended lifecycle hooks: `onStart`, `onBeforeRetry`, `onCacheHit`
- `cancelAll` and `cancelRequest` methods for request cancellation
- Stale-while-revalidate pattern with `revalidateOnStale` option
- `ApiQueryEndpoint<P, R>` and `ApiMutationEndpoint<V, R>` types
- Mutation functions pre-bound at composer creation via `mutations` config
- Automatic cache invalidation via `invalidates` on mutation configs
- Cross-endpoint optimistic updates via `optimistic` on mutation configs

### Changed
- Improved TypeScript types for better IDE support
- Enhanced error messages for better debugging
- Optimized bundle size

## [1.1.0] - 2024-09-17

### Added
- Store isolation feature for multiple independent store instances
- `throwOnError` option to reject promises on failure
- `resetAll` and `invalidateAll` batch operations
- `startPolling` method for interval-based API polling
- `fetchedAt` timestamp tracking for every endpoint
- Factory function `createApiStore` with pre-bound hooks

### Changed
- Improved hooks performance with optimized subscriptions
- Enhanced persistence to handle three-state logic (true/false/undefined)
- Updated build scripts for better dual package support (ESM + CJS)

### Fixed
- Race condition handling in concurrent requests
- Memory leaks in polling cleanup
- Persistence edge cases with React Native

## [1.0.0] - 2024-09-15

### Added
- Initial release
- Core API state management with Zustand
- Support for idle, loading, success, and error states
- Persistent state with custom storage support
- Middleware support for customizing API behavior
- Global error handling with unsubscribe support
- Request cancellation via AbortSignal
- Automatic retry with exponential back-off
- Race condition protection
- Built-in caching via `staleTime`
- Cache invalidation via `invalidateApi`
- Batch operations with `invalidateApis` and `resetApiStates`
- Optimistic updates with automatic rollback
- Request timeout with TIMEOUT error code
- Request deduplication via `dedupe` option
- TypeScript support with strong typing
- SSR-safe implementation
- Comprehensive test suite
