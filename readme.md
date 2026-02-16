# Zustand API Manager

[![npm version](https://img.shields.io/npm/v/zustand-api-manager.svg)](https://www.npmjs.com/package/zustand-api-manager)
[![downloads](https://img.shields.io/npm/dm/zustand-api-manager.svg)](https://www.npmjs.com/package/zustand-api-manager)
[![bundle size](https://img.shields.io/bundlephobia/minzip/zustand-api-manager)](https://bundlephobia.com/package/zustand-api-manager)
[![license](https://img.shields.io/npm/l/zustand-api-manager.svg)](https://github.com/mehmetasilkilic/zustand-api-manager/blob/main/LICENSE)
[![GitHub](https://img.shields.io/github/stars/mehmetasilkilic/zustand-api-manager?style=social)](https://github.com/mehmetasilkilic/zustand-api-manager)

A powerful, lightweight, and flexible API state management solution built on top of Zustand.

**Why Zustand API Manager?**
- 🪶 **Lightweight** — Built on Zustand, much smaller than React Query
- 🎯 **Simple API** — Fewer concepts to learn, more productive
- ⚡ **High Performance** — Selective subscriptions, stable references
- 🔧 **Flexible** — Works standalone or with existing Zustand stores
- 📘 **TypeScript First** — Full type safety out of the box
- 🎨 **DevTools** — Built-in Zustand DevTools integration

## Quick Start

```typescript
import { useApiQuery } from 'zustand-api-manager'

function UserProfile({ userId }) {
  // Declarative mode — auto-fetches on mount and when userId changes
  const { data, isLoading } = useApiQuery<User>('user', {
    queryFn: () => fetchUser(userId),
    staleTime: 60_000,
    retry: 2
  })

  if (isLoading) return <Loading />
  return <div>{data?.name}</div>
}
```

## Table of Contents

- [Installation](#installation)
- [Why Choose This](#why-choose-this)
- [Comparison](#comparison)
- [Features](#features)
- [Usage](#usage)
  - [Basic Usage](#basic-usage)
  - [Observer Mode](#observer-mode)
  - [Imperative Mode](#imperative-mode)
  - [Global Loading](#global-loading)
  - [Advanced Usage (Composer)](#advanced-usage-composer)
- [API Reference](#api-reference)
- [Middleware and Error Handling](#middleware-and-error-handling)
- [Abort & Retry](#abort--retry)
- [Caching with staleTime](#caching-with-staletime)
- [Cache Invalidation](#cache-invalidation)
- [Batch Operations](#batch-operations)
- [Optimistic Updates](#optimistic-updates)
- [Request Timeout](#request-timeout)
- [Request Deduplication](#request-deduplication)
- [Polling](#polling)
- [Throw on Error](#throw-on-error)
- [Multiple Store Instances](#multiple-store-instances)
- [Persistence in React Native](#persistence-in-react-native)
- [Performance](#performance)
- [TypeScript Support](#typescript-support)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npm install zustand-api-manager zustand immer
```

`zustand` and `immer` are peer dependencies and must be installed alongside the package.

## Why Choose This?

### vs React Query / TanStack Query
- ✅ **Smaller bundle size** (~10KB vs ~40KB gzipped)
- ✅ **Simpler API** with fewer concepts
- ✅ **Built on Zustand** if you're already using it
- ✅ **Better TypeScript inference** out of the box
- ⚠️ No automatic background refetching (use `usePolling` or `revalidateOnStale`)

### vs SWR
- ✅ **More features** (mutations, middleware, devtools)
- ✅ **Store isolation** for multi-tenant apps
- ✅ **Better error handling** with retry strategies
- ✅ **Optimistic updates** with automatic rollback
- ≈ Similar bundle size and performance

### vs Redux Toolkit Query
- ✅ **Much simpler** setup and API
- ✅ **Smaller bundle** and less boilerplate
- ✅ **Works without Redux** ecosystem
- ✅ **Faster learning curve**
- ⚠️ Less opinionated (more flexibility, less structure)

## Comparison

| Feature | Zustand API Manager | React Query | SWR | RTK Query |
|---------|:------------------:|:-----------:|:---:|:---------:|
| Bundle Size (gzip) | ~10KB | ~40KB | ~12KB | ~35KB |
| TypeScript | ✅ | ✅ | ✅ | ✅ |
| Queries | ✅ | ✅ | ✅ | ✅ |
| Mutations | ✅ | ✅ | ⚠️ | ✅ |
| Caching | ✅ | ✅ | ✅ | ✅ |
| Polling | ✅ | ✅ | ✅ | ✅ |
| Retry | ✅ | ✅ | ✅ | ✅ |
| Optimistic Updates | ✅ | ✅ | ✅ | ✅ |
| Dedupe | ✅ | ✅ | ✅ | ✅ |
| DevTools | ✅ | ✅ | ❌ | ✅ |
| Store Isolation | ✅ | ⚠️ | ❌ | ❌ |
| Global Config | ✅ | ✅ | ✅ | ✅ |
| Prefetching | ✅ | ✅ | ✅ | ✅ |
| SSR | ✅ | ✅ | ✅ | ✅ |
| React Native | ✅ | ✅ | ✅ | ✅ |
| Learning Curve | Easy | Medium | Easy | Hard |
| Setup Complexity | Low | Medium | Low | High |

## Features

- Easy-to-use API state management
- Built on top of Zustand for efficient state updates
- Support for idle, loading, success, and error states
- **Declarative auto-fetching** — provide `queryFn` and data is fetched automatically on mount
- **Observer mode** — multiple components can read the same key without triggering extra fetches
- `query` returns the response data directly on success
- **Stable function references** — `query`, `reset`, and `invalidate` are wrapped in `useCallback` and safe to use in `useEffect` dependency arrays
- **Optimized subscriptions** — hooks subscribe only to the data slice that changes; store methods are read without creating extra subscriptions
- Persistent state options with custom storage support (sync and async)
- Middleware support for customizing API call behavior
- Global error handling with unsubscribe support
- Request cancellation via `AbortSignal` (including mid-retry abort)
- Automatic retry with exponential back-off, customizable `shouldRetry` and `backoff` strategies
- Race condition protection (stale responses are automatically discarded)
- Built-in caching via `staleTime` — skip refetches when data is fresh
- Cache invalidation via `invalidate` — mark data as stale without removing it
- Batch operations via `invalidateApis`, `resetApiStates`, `resetAll`, and `invalidateAll`
- Optimistic updates with automatic rollback on error
- Request timeout with `TIMEOUT` error code
- Request deduplication via `dedupe` — concurrent calls share a single in-flight promise
- `throwOnError` option — reject the promise instead of resolving to `undefined` on failure
- `onSettled` callback — runs after both success and error for cleanup
- `usePolling` hook for interval-based refetching with `immediate` option, `enabled` toggle, and overlap guard
- `useApiMutation` hook for mutations with better semantics
- `usePrefetch` for preloading data
- `cancelAll` and `cancelRequest` for request cancellation
- `revalidateOnStale` for stale-while-revalidate pattern
- `fetchedAt` timestamp tracking for every endpoint
- SSR-safe (no `localStorage` access on the server)
- Factory function for multiple fully isolated store instances with pre-bound hooks
- Global configuration with `configureApiStore`
- DevTools integration for debugging
- TypeScript support with strong typing (including typed `onSuccess` callbacks)

## Usage

### Basic Usage

The recommended way to use `useApiQuery` is **declarative mode** — provide a `queryFn` and the hook automatically fetches on mount:

```typescript
import { useApiQuery } from "zustand-api-manager";

interface UserData {
  id: number;
  username: string;
}

function MyComponent({ userId }: { userId: number }) {
  const { data, isLoading, isError, error } = useApiQuery<UserData>("user", {
    queryFn: () => fetchUserData(userId),
    staleTime: 30_000, // Cache for 30 seconds
    onSuccess: (data) => {
      console.log("User data fetched!", data.username);
    },
    onError: (error) => {
      console.error("An error occurred:", error.message);
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error: {error?.message}</div>;
  return <div>{data?.username}</div>;
}
```

The hook automatically refetches when `key` changes. Use `enabled` to control when fetching happens:

```typescript
function ConditionalFetch({ userId, isReady }: { userId: number; isReady: boolean }) {
  const { data, isLoading } = useApiQuery<UserData>("user", {
    queryFn: () => fetchUserData(userId),
    enabled: isReady, // Won't fetch until isReady is true
  });

  // ...
}
```

### Observer Mode

When you omit `queryFn`, the hook acts as a **read-only observer** — it subscribes to a key's state without triggering any fetch. This is useful when one component owns the fetch and others just read the result:

```typescript
// Component A: owns the fetch
function UserFetcher({ userId }: { userId: number }) {
  const { data } = useApiQuery<User>("user", {
    queryFn: () => fetchUser(userId),
  });
  return <div>{data?.name}</div>;
}

// Component B: reads the same data without fetching
function UserBadge() {
  const { data } = useApiQuery<User>("user"); // observer mode
  return <span>{data?.name}</span>;
}
```

### Imperative Mode

You can still trigger fetches manually using the `query` function:

```typescript
function SearchComponent() {
  const { data, isLoading, query } = useApiQuery<SearchResult[]>("search");

  const onSearch = async (term: string) => {
    const results = await query(() => searchApi(term));
    if (results) {
      console.log("Found:", results.length, "results");
    }
  };

  return (
    <div>
      <input onChange={(e) => onSearch(e.target.value)} />
      {isLoading && <Spinner />}
      {data?.map((r) => <div key={r.id}>{r.title}</div>)}
    </div>
  );
}
```

> **Note:** `query`, `reset`, and `invalidate` are referentially stable (wrapped in `useCallback`), so they won't cause infinite loops when listed in `useEffect` dependency arrays.

### Global Loading

The `useLoadingStates` hook allows you to check the loading state of one or multiple API calls:

```typescript
import { useLoadingStates } from "zustand-api-manager";

function Dashboard() {
  // Check if any API is loading
  const isAnyLoading = useLoadingStates();

  // Check if specific APIs are loading
  const isUserOrPostsLoading = useLoadingStates(["user", "posts"]);

  // Check if a single API is loading
  const isUserLoading = useLoadingStates("user");

  return (
    <div>
      {isAnyLoading && <div>Loading something...</div>}
      {isUserOrPostsLoading && <div>Loading user or posts...</div>}
      {isUserLoading && <div>Loading user data...</div>}
    </div>
  );
}
```

### Advanced Usage (Composer)

The composer provides a fully type-safe API hook factory with parameter passthrough and declarative auto-fetching.

1. Define your API structure and create the composer with bound query and mutation functions:

```typescript
import {
  createApiComposer,
  ApiQueryEndpoint,
  ApiMutationEndpoint,
} from "zustand-api-manager";

interface MyApiStructure {
  getUsers: ApiQueryEndpoint<void, User[]>;
  getPost: ApiQueryEndpoint<{ id: number }, Post>;
  createPost: ApiMutationEndpoint<CreatePostPayload, Post>;
}

export const useApi = createApiComposer<MyApiStructure>({
  queries: {
    getUsers: () => api.getUsers(),
    getPost: (params) => api.getPost(params),
  },
  mutations: {
    createPost: (payload) => api.createPost(payload),
  },
});
```

2. Use declarative mode by passing options as the second argument. For endpoints with parameters, provide `params`:

```typescript
function PostDetail({ postId }: { postId: number }) {
  // Auto-fetches on mount and when postId changes
  const { data, isLoading } = useApi("getPost", { params: { id: postId } });

  if (isLoading) return <Spinner />;
  return <div>{data?.title}</div>;
}
```

For endpoints with `void` params, pass an empty options object:

```typescript
function UserList() {
  // Auto-fetches on mount
  const { data, isLoading } = useApi("getUsers", {});

  if (isLoading) return <Spinner />;
  return <ul>{data?.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

Use `enabled` to conditionally fetch:

```typescript
function PostDetail({ postId, isReady }: { postId: number; isReady: boolean }) {
  const { data } = useApi("getPost", {
    params: { id: postId },
    enabled: isReady,
  });
  // ...
}
```

Observer mode (no second argument) and imperative `query()` still work:

```typescript
function PostObserver() {
  const { data } = useApi("getPost"); // reads state without fetching

  // Or trigger manually:
  const { query } = useApi("getPost");
  const handleClick = () => query({ id: 1 });
}
```

Mutations use `mutate()`:

```typescript
function CreatePost() {
  const { mutate, isLoading } = useApi("createPost");

  const handleSubmit = () => {
    mutate({ title: "Hello", body: "World" });
  };

  return <button onClick={handleSubmit}>Create</button>;
}
```

## API Reference

### `useApiStore`

The default singleton store for managing API states. Provides the following methods:

- `setApiState(key, state, persist?)` — Update the state for a specific API key. `persist` is three-state: `true` marks for persistence, `false` removes persistence, `undefined` (omitted) leaves persistence unchanged
- `resetApiState(key)` — Reset the state for a specific API key
- `invalidateApi(key)` — Mark a key's cache as stale (clears `fetchedAt` without removing data)
- `invalidateApis(keys)` — Batch-invalidate multiple keys in a single state update
- `resetApiStates(keys)` — Batch-reset multiple keys in a single state update
- `resetAll()` — Reset every API state and clear all persistence (useful for logout)
- `invalidateAll()` — Mark every cached key as stale in a single state update
- `handleApi(key, apiCall, options?)` — Handle an API call with automatic state management. Returns `Promise<T | undefined>` (the response data on success, `undefined` otherwise)
- `addMiddleware(middleware)` — Add middleware; returns an **unsubscribe** function
- `addErrorHandler(handler)` — Add a global error handler; returns an **unsubscribe** function
- `cancelAll()` — Cancel all in-flight requests
- `cancelRequest(key)` — Cancel a specific in-flight request

### `createApiStore(config?)`

Factory function that creates an isolated store instance **with pre-bound convenience hooks**. Useful for SSR, testing, or when you need multiple independent stores.

```typescript
import { createApiStore } from "zustand-api-manager";

const {
  useStore,
  useApiQuery,
  useLoadingStates,
  usePolling,
  useApiMutation,
  usePrefetch,
  createApiComposer,
} = createApiStore({
  storageKey: "my-app-api", // localStorage key (default: 'api_store')
  storage: customStorage, // custom storage backend (optional)
});

// Bound hooks — no need to pass the store argument
const { data } = useApiQuery<User>("getUser", {
  queryFn: () => fetchUser(1),
});
const isLoading = useLoadingStates("getUser");

const useApi = createApiComposer<MyApiStructure>({
  queries: { getUser: (params) => api.getUser(params) },
});
```

### `useApiQuery`

A hook for managing API queries. Supports two modes:

- **Declarative mode** — provide `queryFn` in options to auto-fetch on mount
- **Observer mode** — omit options to read state without fetching

Returns an `ApiQueryResult<T>` with:

- `status` — The raw `FetchStatus` value (`'IDLE'`, `'LOADING'`, `'SUCCESS'`, `'ERROR'`)
- `isIdle` — `true` if the API has not been called yet
- `isLoading` — `true` if the API is currently loading
- `isError` — `true` if an error occurred
- `isSuccess` — `true` if the API call was successful
- `data` — The data returned from the API call
- `error` — The error object if the call failed (`ApiError`)
- `fetchedAt` — Timestamp (ms since epoch) of the last successful fetch, or `null`
- `query(apiCall, options?)` — Trigger the API call imperatively. Returns `Promise<T | undefined>`. **Stable reference**
- `reset()` — Reset the API state. **Stable reference**
- `invalidate()` — Mark this endpoint's cache as stale. **Stable reference**

The hook only subscribes to the state slice for the given key, so changes to other keys won't trigger re-renders.

**Options (`UseApiQueryOptions<T>`):**

- `queryFn` — The fetch function. When provided, enables declarative auto-fetch mode.
- `enabled` — If `false`, the auto-fetch is paused. Defaults to `true`.
- Plus all `ApiCallOptions<T>` fields (`staleTime`, `retry`, `onSuccess`, etc.)

### `useApiMutation`

A hook for managing mutations (POST, PUT, DELETE). Binds a mutation function at hook level:

```typescript
const { mutate, isLoading, data, error, reset } = useApiMutation<User, CreateUserPayload>(
  "createUser",
  (payload) => api.createUser(payload)
);

await mutate({ name: "John", email: "john@example.com" });
```

### `useLoadingStates`

A hook to check loading states for one or more API keys:

- No arguments: returns `true` if **any** API is loading
- `string`: returns `true` if the given key is loading
- `string[]`: returns `true` if **any** of the given keys are loading

### `usePolling`

A React hook for interval-based polling with automatic cleanup on unmount. Returns the same `ApiQueryResult<T>` as `useApiQuery`.

- `key` — The unique identifier for the API endpoint
- `apiCall` — A function that returns a promise resolving to `{ data: T }`
- `interval` — The polling interval in milliseconds
- `options` — Optional `ApiCallOptions<T>` with additional fields:
  - `immediate?: boolean` — Fire the first request immediately instead of waiting for the first interval tick
  - `enabled?: boolean` — Toggle polling on/off (default `true`)

If the previous poll is still in-flight when the next tick fires, the tick is skipped automatically to prevent request stacking.

```typescript
import { usePolling } from "zustand-api-manager";

function NotificationBell() {
  const { data, isLoading } = usePolling<Notification[]>(
    "notifications",
    () => fetchNotifications(),
    10_000, // every 10 seconds
    { immediate: true }
  );

  return <span>({data?.length ?? 0})</span>;
}
```

You can conditionally enable/disable polling:

```typescript
function LiveFeed({ isActive }: { isActive: boolean }) {
  const { data } = usePolling<FeedItem[]>(
    "feed",
    () => fetchFeed(),
    5_000,
    { enabled: isActive, immediate: true }
  );

  return <div>{data?.map((item) => <p key={item.id}>{item.text}</p>)}</div>;
}
```

### `usePrefetch`

A hook that provides a `prefetch` function for preloading data before it's needed:

```typescript
const { prefetch } = usePrefetch();

const handleMouseEnter = (userId: number) => {
  prefetch(`user-${userId}`, () => api.getUser(userId), { staleTime: 60_000 });
};
```

### `createApiComposer`

Creates a strongly-typed API composer. For query endpoints, returns `query`, `reset`, `invalidate`, `status`, and `fetchedAt`. For mutation endpoints, returns `mutate` and `reset`. All function references are stable across re-renders.

Supports declarative auto-fetching via an optional second argument with `params` and `enabled`.

```typescript
const useApi = createApiComposer<MyApiStructure>({
  queries: {
    getUser: (params) => api.getUser(params),
    listUsers: () => api.listUsers(),
  },
  mutations: {
    createUser: (payload) => api.createUser(payload),
  },
});
```

### `FetchStatus`

A constant object representing the different states of an API call:

- `FetchStatus.IDLE`
- `FetchStatus.LOADING`
- `FetchStatus.SUCCESS`
- `FetchStatus.ERROR`

### `ApiCallOptions<T>`

Options you can pass to `query()` and `mutate()`. The type parameter `T` is inferred automatically from the API call.

- `onSuccess?: (data: T) => void` — called with the **typed** response data after a successful response
- `onError?: (error: ApiError) => void` — called with the error after all retries are exhausted
- `onSettled?: () => void` — called when the request completes, regardless of success or failure (useful for cleanup)
- `onStart?: () => void` — called when the API call starts
- `onCacheHit?: (data: T) => void` — called when cached data is returned
- `onBeforeRetry?: (error: ApiError, attempt: number) => void` — called before each retry attempt
- `persist?: boolean` — persist this key's state to localStorage
- `signal?: AbortSignal` — abort the request (from an `AbortController`)
- `retry?: number` — number of retries on failure (default `0`, exponential back-off)
- `shouldRetry?: (error: ApiError, attempt: number) => boolean` — predicate to decide whether to retry a specific error (default: always retry)
- `backoff?: (attempt: number) => number` — custom delay function in ms before retrying (default: `Math.min(1000 * 2 ** attempt, 10000)`)
- `staleTime?: number` — skip the request if data was fetched within this many milliseconds
- `revalidateOnStale?: boolean` — return stale data immediately while refetching in the background
- `optimisticData?: T` — data to show immediately while the request is in-flight (rolled back on error)
- `timeout?: number` — abort the request if it doesn't complete within this many milliseconds (error code: `'TIMEOUT'`)
- `dedupe?: boolean` — if `true`, concurrent calls to the same key share the existing in-flight promise
- `throwOnError?: boolean` — if `true`, the promise rejects with `ApiError` instead of resolving to `undefined` on failure

## Middleware and Error Handling

You can add custom middleware and error handlers. Both return an **unsubscribe** function for cleanup:

```typescript
const apiStore = useApiStore.getState();

// Add middleware — returns unsubscribe function
const removeMiddleware = apiStore.addMiddleware(
  (next) => async (key, apiCall, options) => {
    console.log(`API call started: ${key}`);
    await next(key, apiCall, options);
    console.log(`API call finished: ${key}`);
  }
);

// Add error handler — returns unsubscribe function
const removeErrorHandler = apiStore.addErrorHandler((error, key) => {
  console.error(`Error in API call ${key}:`, error.message);
});

// Clean up when no longer needed
removeMiddleware();
removeErrorHandler();
```

This is particularly useful in React effects:

```typescript
useEffect(() => {
  const unsub = useApiStore.getState().addErrorHandler((error, key) => {
    showToast(`${key} failed: ${error.message}`);
  });
  return unsub; // cleanup on unmount
}, []);
```

> **Note:** Error handlers registered at any point — even after a request starts — will be called if that request fails. The handler list is always read fresh at error-time.

## Abort & Retry

### Cancelling requests

Pass an `AbortSignal` to cancel an in-flight request. The signal is also respected **during retry back-off**, so aborted requests stop immediately instead of waiting for the next retry timer:

```typescript
function SearchComponent() {
  const { data, isLoading, query } = useApiQuery<SearchResult[]>("search");
  const controllerRef = useRef<AbortController>();

  const onSearch = (term: string) => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();

    query(() => searchApi(term), {
      signal: controllerRef.current.signal,
    });
  };

  // ...
}
```

### Retrying failed requests

Set `retry` to automatically retry on failure with exponential back-off (capped at 10 seconds):

```typescript
query(() => fetchData(), { retry: 3 }); // up to 3 retries (4 total attempts)
```

### Conditional retries with `shouldRetry`

Use `shouldRetry` to skip retries for specific error types. The predicate receives the error and the current attempt index (0-based):

```typescript
query(() => fetchData(), {
  retry: 3,
  shouldRetry: (error, attempt) => {
    if (error.status === 401 || error.status === 403) return false;
    if (error.status && error.status >= 400 && error.status < 500) return false;
    return true;
  },
});
```

### Custom back-off strategy

Use `backoff` to provide a custom delay function. It receives the attempt index and should return the delay in milliseconds:

```typescript
query(() => fetchData(), {
  retry: 3,
  // Linear back-off: 500ms, 1000ms, 1500ms
  backoff: (attempt) => 500 * (attempt + 1),
});
```

The default is exponential back-off capped at 10 seconds: `Math.min(1000 * 2 ** attempt, 10000)`.

### Race condition protection

When multiple requests are made for the same key, only the latest request's result is applied. Earlier (stale) responses are automatically discarded. This happens transparently — no configuration needed.

## Caching with staleTime

Use `staleTime` to avoid redundant refetches. If the data was successfully fetched within the given window (in milliseconds), the request is skipped and the cached data is returned immediately:

```typescript
function UserProfile({ userId }: { userId: number }) {
  // Won't refetch if the last successful fetch was less than 30 seconds ago
  const { data } = useApiQuery<User>("user", {
    queryFn: () => fetchUser(userId),
    staleTime: 30_000,
  });

  return <div>{data?.name}</div>;
}
```

The `staleTime` check uses the `fetchedAt` timestamp stored in each endpoint's state. You can also access `fetchedAt` directly from the hook result for custom freshness logic.

## Cache Invalidation

Use `invalidate()` to mark a key's cache as stale without removing the existing data. The next call with `staleTime` will refetch instead of returning the cache:

```typescript
function UserSettings() {
  const { data, invalidate } = useApiQuery<User>("user", {
    queryFn: () => fetchUser(1),
    staleTime: 60_000,
  });

  const updateName = async (name: string) => {
    await saveUserName(name);
    // Mark the user cache as stale — data is still visible,
    // but the next fetch with staleTime will hit the server
    invalidate();
  };

  // ...
}
```

You can also call `invalidateApi` directly on the store:

```typescript
useApiStore.getState().invalidateApi("user");
```

To invalidate multiple keys at once, see [Batch Operations](#batch-operations).

## Batch Operations

Use `invalidateApis` and `resetApiStates` to operate on multiple keys in a **single state update**, avoiding unnecessary intermediate re-renders:

```typescript
const store = useApiStore.getState();

// Invalidate multiple caches at once (e.g. after a mutation that affects several endpoints)
store.invalidateApis(["getUser", "getUserPosts", "getUserSettings"]);

// Reset multiple keys at once (e.g. clearing all user-related state on logout)
store.resetApiStates(["getUser", "getUserPosts", "getUserSettings"]);
```

For a full wipe, use `resetAll` or `invalidateAll`:

```typescript
const store = useApiStore.getState();

// Invalidate every cached key — existing data remains visible, but staleTime will refetch
store.invalidateAll();

// Reset everything — clears all data, errors, and persistence
store.resetAll();
```

All batch methods are also available on custom store instances created with `createApiStore`.

## Optimistic Updates

Use `optimisticData` to show data immediately while a request is in-flight. If the request fails, the state automatically rolls back to the previous data:

```typescript
function ToggleFavorite({ post }: { post: Post }) {
  const { data, query } = useApiQuery<Post>("updatePost");

  const toggle = () => {
    const optimistic = { ...post, isFavorite: !post.isFavorite };

    query(() => updatePost(post.id, { isFavorite: !post.isFavorite }), {
      optimisticData: optimistic,
      onError: () => {
        showToast("Failed to update — reverted");
      },
    });
  };

  return <button onClick={toggle}>{data?.isFavorite ? "★" : "☆"}</button>;
}
```

During the optimistic update the status is `LOADING` and the optimistic data is available on `data`. On success, the real response replaces it. On error, it rolls back to whatever data was there before the call.

## Request Timeout

Use `timeout` to automatically abort a request that takes too long. The error will have code `'TIMEOUT'`:

```typescript
query(() => fetchSlowEndpoint(), {
  timeout: 5000, // abort after 5 seconds
  onError: (error) => {
    if (error.code === "TIMEOUT") {
      showToast("Request timed out — please try again");
    }
  },
});
```

When both `timeout` and `signal` are provided, whichever fires first wins. A user abort produces `'ABORT_ERR'`, while a timeout produces `'TIMEOUT'`.

## Request Deduplication

Use `dedupe` to prevent duplicate network calls when multiple components request the same data simultaneously. Concurrent calls to the same key will share a single in-flight promise:

```typescript
// In ComponentA
query(() => fetchUser(1), { dedupe: true });

// In ComponentB (called at the same time)
query(() => fetchUser(1), { dedupe: true });
// ^ reuses the promise from ComponentA — only one network request is made
```

Once the shared request completes, subsequent calls start a fresh request. Deduplication is opt-in and per-call.

## Polling

Use the `usePolling` hook to poll an endpoint at a regular interval. Polling starts automatically when the component mounts and stops on unmount. Use `{ immediate: true }` to fire the first request immediately instead of waiting for the first interval tick:

```typescript
import { usePolling } from "zustand-api-manager";

function NotificationBell() {
  const { data } = usePolling<Notification[]>(
    "notifications",
    () => fetchNotifications(),
    10_000, // every 10 seconds
    { immediate: true }
  );

  return <span>({data?.length ?? 0})</span>;
}
```

If the previous poll is still in-flight when the next tick fires, the tick is skipped automatically to prevent request stacking.

You can toggle polling on and off with the `enabled` option:

```typescript
function LiveDashboard({ isVisible }: { isVisible: boolean }) {
  const { data } = usePolling<Stats>(
    "stats",
    () => fetchStats(),
    5_000,
    { enabled: isVisible, immediate: true }
  );

  return <div>{data?.value}</div>;
}
```

## The `onSettled` Callback

Use `onSettled` to run cleanup logic after a request completes, regardless of whether it succeeded or failed:

```typescript
const [modalOpen, setModalOpen] = useState(true);

query(() => submitForm(data), {
  onSuccess: () => showToast("Saved!"),
  onError: (error) => showToast(`Failed: ${error.message}`),
  onSettled: () => setModalOpen(false), // always close the modal
});
```

`onSettled` is called after `onSuccess` or `onError`.

## Throw on Error

By default, `query()` resolves to `undefined` when a request fails. Use `throwOnError` to reject the promise with the `ApiError` instead, enabling `try/catch` patterns:

```typescript
try {
  const data = await query(() => fetchUser(1), { throwOnError: true });
  // data is guaranteed non-undefined here
  console.log("User:", data.username);
} catch (error) {
  // error is the ApiError with optional status/code fields
  console.error("Request failed:", error.message);
}
```

The store state is still updated normally (status set to `ERROR`, error handlers called) — the only difference is the promise rejection behavior.

## Multiple Store Instances

By default, all hooks use a shared singleton store. For SSR, testing, or isolated modules, create separate instances with `createApiStore`. Each store is **fully isolated** — race-condition tracking, request deduplication, and all state are scoped to the store instance, so you can safely reuse the same key names across different stores:

```typescript
import { createApiStore } from "zustand-api-manager";

const {
  useStore,
  useApiQuery: useFeatureQuery,
  useLoadingStates: useFeatureLoading,
  createApiComposer: createFeatureComposer,
} = createApiStore({ storageKey: "my-feature" });

function MyComponent() {
  // These are already bound to the custom store — no second argument needed
  const { data } = useFeatureQuery<User>("getUser", {
    queryFn: () => fetchUser(1),
  });
  const isLoading = useFeatureLoading("getUser");
  // ...
}
```

## Persistence in React Native

The default store uses `localStorage` for persistence, which isn't available in React Native. Use the `storage` option in `createApiStore` to plug in any async-compatible storage backend such as `@react-native-async-storage/async-storage`:

```bash
npm install @react-native-async-storage/async-storage
```

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createApiStore } from "zustand-api-manager";

const {
  useStore,
  useApiQuery,
  useLoadingStates,
  createApiComposer,
} = createApiStore({
  storageKey: "my-app-api",
  storage: {
    getItem: (name) => AsyncStorage.getItem(name),
    setItem: (name, value) => AsyncStorage.setItem(name, value),
    removeItem: (name) => AsyncStorage.removeItem(name),
  },
});
```

Then use the returned hooks exactly like you would with the default store:

```typescript
import React from "react";
import { View, Text, ActivityIndicator } from "react-native";

function UserProfile() {
  const { data, isLoading } = useApiQuery<User>("getUser", {
    queryFn: () => fetchUser(1),
    persist: true,
  });

  if (isLoading) return <ActivityIndicator />;
  return (
    <View>
      <Text>{data?.name}</Text>
    </View>
  );
}
```

Because the storage interface accepts **async** `getItem` / `setItem` / `removeItem`, any key-value store that returns promises works — MMKV, Expo SecureStore, etc.:

```typescript
import * as SecureStore from "expo-secure-store";

const { useStore } = createApiStore({
  storageKey: "secure-api",
  storage: {
    getItem: (name) => SecureStore.getItemAsync(name),
    setItem: (name, value) => SecureStore.setItemAsync(name, value),
    removeItem: (name) => SecureStore.deleteItemAsync(name),
  },
});
```

> **Tip:** Mark only the keys you actually need offline with `persist: true` in the call options — this keeps the stored payload small and rehydration fast.

## Performance

The hooks are designed for minimal re-renders:

- **Single subscription per hook** — `useApiQuery` and `createApiComposer` subscribe only to the state slice for the given key. Changes to unrelated keys don't trigger re-renders.
- **Stable function references** — `query`, `reset`, and `invalidate` are wrapped in `useCallback` and only change when the `key` changes. This means they're safe to include in `useEffect` dependency arrays without causing infinite loops.
- **No extra subscriptions for store methods** — Store methods are read via `getState()` inside callbacks rather than creating reactive subscriptions, reducing overhead.
- **Declarative auto-fetch uses refs** — `queryFn` and options are stored in refs so changes don't restart the effect. Only `key`, `enabled`, and serialized `params` trigger refetches.

## Documentation

- 📘 [API Reference](./docs/api-reference.md) - Complete API documentation
- 🔄 [Migration Guide](./docs/migration.md) - Migrating from React Query, SWR, RTK Query
- 🐛 [Troubleshooting](./docs/troubleshooting.md) - Common issues and solutions
- ⚡ [Performance Guide](./docs/performance.md) - Optimization best practices
- 💡 [Examples](./examples) - Real-world usage examples

## TypeScript Support

This package is written in TypeScript and provides strong typing out of the box.

- `ApiCallOptions<T>` is generic — `onSuccess` receives typed data, `optimisticData` is type-checked
- `useApiQuery<T>` returns a fully typed `ApiQueryResult<T>`
- `UseApiQueryOptions<T>` extends `ApiCallOptions<T>` with `queryFn` and `enabled`
- `createApiComposer<TApiStructure>()` infers parameter and response types for each endpoint
- `ComposerDeclarativeOptions` provides conditional types for declarative mode per endpoint
- All exported types are available: `ApiState`, `ApiError`, `ApiCallOptions`, `UseApiQueryOptions`, `ApiStore`, `ApiQueryResult`, `FetchStatus`, etc.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
