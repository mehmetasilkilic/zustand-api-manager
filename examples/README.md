# Examples

This directory contains practical examples of using `zustand-api-manager` v2.

All examples use `createApiComposer` — the recommended way to define and consume APIs.

## Available Examples

### 1. Basic Usage (`basic/`)
Simple single-query example showing:
- `createApiComposer` with a typed `ApiQueryEndpoint`
- Declarative auto-fetch with `params`
- Loading & error states
- Cache with `staleTime`
- Persistence
- Retry logic

### 2. Composer Modern (`composer-modern/`)
Full-featured example covering:
- `createApiComposer` with multiple query and mutation endpoints
- Declarative auto-fetch with param changes
- Imperative `query()` calls (button click)
- Mutations with `invalidates` and `optimistic` updates
- Delete with optimistic removal
- Bare function mutations (no auto-invalidation)

### 3. Authentication (`authentication/`)
Login flow demonstrating:
- Composer mutation for POST requests
- Form handling with `mutate()`
- `onSuccess` / `onError` callbacks
- Logout with `resetAll()`

### 4. File Upload (`file-upload/`)
File upload showing:
- Mutation with `AbortSignal` for cancellation
- Timeout handling
- Error code checks (`TIMEOUT`, `ABORT_ERR`)
- Success/error feedback

### 5. Polling (`polling/`)
Notification bell with real-time updates:
- `polling: 10_000` declarative option
- Conditional polling with `enabled`
- `staleTime` to avoid redundant fetches
- Pause polling while reading notifications

### 6. Multiple Stores (`multiple-stores/`)
Isolated feature module with:
- `createApiStore()` for store isolation
- Pre-bound `createApiComposer` and `useLoadingStates`
- `useApi.prefetch()` for preloading on hover
- DevTools integration
- Feature-specific persistence

### 7. Basic React (`basic-react/`)
Runnable Vite app combining all patterns:
- Declarative queries, imperative queries, polling
- Mutations with invalidation and optimistic updates
- Two isolated stores proving store isolation
- `useLoadingStates` for global and per-store loading indicators
- Prefetch on hover
- Bulk operations (`resetAll`, `invalidateAll`)

### 8. React Native (`react-native/`)
Same patterns adapted for React Native:
- Native `View`, `Text`, `Button`, `ActivityIndicator` components
- Two isolated stores with `createApiStore`
- All composer features (declarative, imperative, polling, mutations)
- Global and per-store loading banners

## Running the Runnable Example

The `basic-react/` example is a complete Vite app:

```bash
cd examples/basic-react
npm install
npm run dev
```

The other examples are standalone components. Import them into any React app:

```tsx
import BasicExample from './examples/basic/App'
import LoginForm from './examples/authentication/LoginForm'
```

## Key Patterns

- **Declarative mode**: Pass `params` (or `{}` for void queries) to auto-fetch on mount and refetch on param changes
- **Imperative mode**: Omit the second argument, call `query(params)` or `mutate(vars)` manually
- **Cache invalidation**: Define `invalidates: ['listUsers']` on mutations to auto-refetch active queries
- **Optimistic updates**: Define `optimistic: { listUsers: (vars, current) => [...] }` for instant UI
- **Polling**: Add `polling: 10_000` to any declarative query
- **Prefetch**: Call `useApi.prefetch('getUser', { id: 2 })` outside of render
- **Store isolation**: Use `createApiStore()` for independent per-feature stores
- **Global loading**: Use `useLoadingStates()` or the bound `store.useLoadingStates()`
- **Cancellation**: Pass `signal` from an `AbortController`, or use `cancelRequest()` / `cancelAll()`
- **Timeout**: Set `timeout: 30000` to auto-abort slow requests
- **Retry**: Set `retry: 3` with optional `shouldRetry` for conditional retries
