# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2024-xx-xx

### Breaking Changes
- **Renamed `useApiHandler` to `useApiQuery`** for better clarity and consistency with `useApiMutation`
  - Migration: Simply find-and-replace `useApiHandler` with `useApiQuery` in your codebase
  - Rationale: Clear separation between queries (reads) and mutations (writes)

- **`createApiComposer` query endpoints renamed methods for consistency:**
  - `handleApi` → `query` (execute the query)
  - `resetApi` → `reset` (reset the state)
  - `invalidateApi` → `invalidate` (invalidate the cache)
  - Migration: Replace method calls in your composer usage:
    ```typescript
    // Before
    const { handleApi, resetApi, invalidateApi } = useApi('getUser')
    handleApi({ id: 1 }, api.getUser)

    // After
    const { query, reset, invalidate } = useApi('getUser')
    query({ id: 1 }, api.getUser)
    ```
  - Rationale: Clearer, more specific naming that matches the pattern (query/mutate)

### Added
- CI/CD pipeline with GitHub Actions for automated testing and publishing
- DevTools integration for better debugging experience
- `useApiMutation` hook for better mutation semantics
- Global configuration support via `configureApiStore`
- Extended lifecycle hooks: `onStart`, `onBeforeRetry`, `onCacheHit`
- Prefetching utilities with `usePrefetch` hook
- `cancelAll` method to cancel all in-flight requests
- Stale-while-revalidate pattern with `revalidateOnStale` option
- **Enhanced `createApiComposer` with native query and mutation support**
  - New `ApiQueryEndpoint<P, R>` type for query endpoints (returns `handleApi`, `resetApi`, `invalidateApi`)
  - New `ApiMutationEndpoint<V, R>` type for mutation endpoints (returns `mutate`, `reset`)
  - Mutation functions are pre-bound at composer creation via `mutations` config
  - Full type-safety for both query and mutation patterns
  - Backward compatible with existing `ApiEndpoint<P, R>` type
- Comprehensive examples directory with real-world use cases
- Split documentation into multiple focused guides
- Code coverage reporting
- Pre-commit hooks for code quality
- ESLint and Prettier configuration

### Changed
- **BREAKING:** Renamed `useApiHandler` to `useApiQuery` for better clarity and consistency with `useApiMutation`
- Improved TypeScript types for better IDE support
- Enhanced error messages for better debugging
- Optimized bundle size

## [1.1.0] - 2024-xx-xx

### Added
- Store isolation feature for multiple independent store instances
- `throwOnError` option to reject promises on failure
- `resetAll` and `invalidateAll` batch operations
- `startPolling` method for interval-based API polling
- Polling improvements with `immediate` and `enabled` options
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

## [1.0.0] - 2024-xx-xx

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
