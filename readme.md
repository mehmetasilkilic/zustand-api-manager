# Zustand API Manager

[![npm version](https://img.shields.io/npm/v/zustand-api-manager.svg)](https://www.npmjs.com/package/zustand-api-manager)
[![downloads](https://img.shields.io/npm/dm/zustand-api-manager.svg)](https://www.npmjs.com/package/zustand-api-manager)
[![GitHub](https://img.shields.io/github/stars/mehmetasilkilic/zustand-api-manager?style=social)](https://github.com/mehmetasilkilic/zustand-api-manager)

A powerful and flexible API state management solution built on top of Zustand.

## Table of Contents

- [Installation](#installation)
- [Features](#features)
- [Usage](#usage)
  - [Basic Usage](#basic-usage)
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

## Features

- Easy-to-use API state management
- Built on top of Zustand for efficient state updates
- Support for idle, loading, success, and error states
- `handleApi` returns the response data directly on success
- **Stable function references** — `handleApi`, `resetApi`, and `invalidateApi` are wrapped in `useCallback` and safe to use in `useEffect` dependency arrays
- **Optimized subscriptions** — hooks subscribe only to the data slice that changes; store methods are read without creating extra subscriptions
- Persistent state options with custom storage support (sync and async)
- Middleware support for customizing API call behavior
- Global error handling with unsubscribe support
- Request cancellation via `AbortSignal` (including mid-retry abort)
- Automatic retry with exponential back-off, customizable `shouldRetry` and `backoff` strategies
- Race condition protection (stale responses are automatically discarded)
- Built-in caching via `staleTime` — skip refetches when data is fresh
- Cache invalidation via `invalidateApi` / `invalidateApis` — mark data as stale without removing it
- Batch operations via `invalidateApis`, `resetApiStates`, `resetAll`, and `invalidateAll`
- Optimistic updates with automatic rollback on error
- Request timeout with `TIMEOUT` error code
- Request deduplication via `dedupe` — concurrent calls share a single in-flight promise
- `throwOnError` option — reject the promise instead of resolving to `undefined` on failure
- `onSettled` callback — runs after both success and error for cleanup
- `usePolling` hook for interval-based refetching with `immediate` option, `enabled` toggle, and overlap guard
- `fetchedAt` timestamp tracking for every endpoint
- SSR-safe (no `localStorage` access on the server)
- Factory function for multiple fully isolated store instances with pre-bound hooks
- TypeScript support with strong typing (including typed `onSuccess` callbacks)

## Usage

### Basic Usage

1. Import the necessary functions:

```typescript
import { useApiHandler, FetchStatus } from "zustand-api-manager";
```

2. Use the `useApiHandler` hook in your components:

```typescript
interface UserData {
  id: number;
  username: string;
}

function MyComponent() {
  const { data, isIdle, isLoading, isError, status, handleApi } =
    useApiHandler<UserData>("user");

  const params = { id: 13 };

  useEffect(() => {
    handleApi(
      () => fetchUserData(params), // API call (close over your params)
      {
        onSuccess: (data) => {
          // `data` is typed as UserData
          console.log("User data fetched successfully!", data.username);
        },
        onError: (error) => {
          console.error("An error occurred:", error.message);
        },
        persist: true,
      }
    );
  }, [handleApi]); // handleApi is stable — safe to include in deps

  if (isIdle) return <div>Ready to fetch</div>;
  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error occurred</div>;

  return <div>{data?.username}</div>;
}
```

> **Note:** `handleApi`, `resetApi`, and `invalidateApi` are referentially stable (wrapped in `useCallback`), so they won't cause infinite loops when listed in `useEffect` dependency arrays.

`handleApi` returns a `Promise<T | undefined>`, so you can also use its return value directly:

```typescript
const user = await handleApi(() => fetchUserData(params));
if (user) {
  console.log("Got user:", user.username);
}
```

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
      {/* Rest of your component */}
    </div>
  );
}
```

### Advanced Usage (Composer)

The composer provides a fully type-safe API hook factory with parameter passthrough.

1. Define your API structure and create the composer:

```typescript
import { createApiComposer, ApiEndpoint } from "zustand-api-manager";

interface MyApiStructure {
  getUsers: ApiEndpoint<void, User[]>;
  getPost: ApiEndpoint<{ id: number }, Post>;
}

export const useApi = createApiComposer<MyApiStructure>();
```

2. Use it in your components. For endpoints with parameters, pass them as the first argument:

```typescript
function PostDetail({ postId }: { postId: number }) {
  const { data, isLoading, handleApi, resetApi } = useApi("getPost");

  useEffect(() => {
    // Params are passed through to the apiCall function
    handleApi({ id: postId }, (params) => fetchPost(params));
  }, [postId, handleApi]); // handleApi is stable — won't cause extra fetches

  if (isLoading) return <Spinner />;
  return <div>{data?.title}</div>;
}
```

For endpoints with `void` params, call `handleApi` with just the API function:

```typescript
function UserList() {
  const { data, isLoading, handleApi } = useApi("getUsers");

  useEffect(() => {
    handleApi(() => fetchUsers());
  }, [handleApi]); // stable reference — safe in deps

  if (isLoading) return <Spinner />;
  return <ul>{data?.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
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

### `createApiStore(config?)`

Factory function that creates an isolated store instance **with pre-bound convenience hooks**. Useful for SSR, testing, or when you need multiple independent stores.

```typescript
import { createApiStore } from "zustand-api-manager";

const { useStore, useApiHandler, useLoadingStates, usePolling, createApiComposer } =
  createApiStore({
    storageKey: "my-app-api", // localStorage key (default: 'api_store')
    storage: customStorage, // custom storage backend (optional)
  });

// Bound hooks — no need to pass the store argument
const { data } = useApiHandler<User>("getUser");
const isLoading = useLoadingStates("getUser");

const useApi = createApiComposer<MyApiStructure>();
```

### `useApiHandler`

A hook for managing individual API calls. Returns an `ApiHandlerResult<T>` with:

- `status` — The raw `FetchStatus` value (`'IDLE'`, `'LOADING'`, `'SUCCESS'`, `'ERROR'`)
- `isIdle` — `true` if the API has not been called yet
- `isLoading` — `true` if the API is currently loading
- `isError` — `true` if an error occurred
- `isSuccess` — `true` if the API call was successful
- `data` — The data returned from the API call
- `error` — The error object if the call failed (`ApiError`)
- `fetchedAt` — Timestamp (ms since epoch) of the last successful fetch, or `null`
- `handleApi(apiCall, options?)` — Trigger the API call. Returns `Promise<T | undefined>`. **Stable reference** — safe to include in `useEffect` deps
- `resetApi()` — Reset the API state. **Stable reference**
- `invalidateApi()` — Mark this endpoint's cache as stale. **Stable reference**

The hook only subscribes to the state slice for the given key, so changes to other keys won't trigger re-renders. The function references (`handleApi`, `resetApi`, `invalidateApi`) are memoized with `useCallback` and only change when the `key` or `store` argument changes.

Accepts an optional second argument to use a custom store instance:

```typescript
const { useStore } = createApiStore();
const { data } = useApiHandler<User>("getUser", useStore);
```

### `useLoadingStates`

A hook to check loading states for one or more API keys:

- No arguments: returns `true` if **any** API is loading
- `string`: returns `true` if the given key is loading
- `string[]`: returns `true` if **any** of the given keys are loading

Also accepts an optional store instance as the second argument.

### `usePolling`

A React hook for interval-based polling with automatic cleanup on unmount. Returns the same `ApiHandlerResult<T>` as `useApiHandler`.

- `key` — The unique identifier for the API endpoint
- `apiCall` — A function that returns a promise resolving to `{ data: T }`
- `interval` — The polling interval in milliseconds
- `options` — Optional `ApiCallOptions<T>` with additional fields:
  - `immediate?: boolean` — Fire the first request immediately instead of waiting for the first interval tick
  - `enabled?: boolean` — Toggle polling on/off (default `true`)
- `store?` — Optional custom store instance

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

Also accepts a custom store instance as the last argument:

```typescript
const { useStore } = createApiStore();
const { data } = usePolling<Stats>("stats", () => fetchStats(), 30_000, { immediate: true }, useStore);
```

### `createApiComposer`

Creates a strongly-typed API composer. Returns a hook with all the same fields as `useApiHandler`, including `resetApi`, `invalidateApi`, `status`, and `fetchedAt`. All function references (`handleApi`, `resetApi`, `invalidateApi`) are stable across re-renders. Accepts an optional store instance:

```typescript
const useApi = createApiComposer<MyApiStructure>(); // uses default store
const useApi = createApiComposer<MyApiStructure>(useStore); // uses custom store
```

### `FetchStatus`

A constant object representing the different states of an API call:

- `FetchStatus.IDLE`
- `FetchStatus.LOADING`
- `FetchStatus.SUCCESS`
- `FetchStatus.ERROR`

### `ApiCallOptions<T>`

Options you can pass to `handleApi`. The type parameter `T` is inferred automatically from the API call.

- `onSuccess?: (data: T) => void` — called with the **typed** response data after a successful response
- `onError?: (error: ApiError) => void` — called with the error after all retries are exhausted
- `onSettled?: () => void` — called when the request completes, regardless of success or failure (useful for cleanup)
- `persist?: boolean` — persist this key's state to localStorage
- `signal?: AbortSignal` — abort the request (from an `AbortController`)
- `retry?: number` — number of retries on failure (default `0`, exponential back-off)
- `shouldRetry?: (error: ApiError, attempt: number) => boolean` — predicate to decide whether to retry a specific error (default: always retry)
- `backoff?: (attempt: number) => number` — custom delay function in ms before retrying (default: `Math.min(1000 * 2 ** attempt, 10000)`)
- `staleTime?: number` — skip the request if data was fetched within this many milliseconds
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
  const { data, isLoading, handleApi } =
    useApiHandler<SearchResult[]>("search");
  const controllerRef = useRef<AbortController>();

  const onSearch = (query: string) => {
    // Cancel the previous request
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();

    handleApi(() => searchApi(query), {
      signal: controllerRef.current.signal,
    });
  };

  // ...
}
```

### Retrying failed requests

Set `retry` to automatically retry on failure with exponential back-off (capped at 10 seconds):

```typescript
handleApi(() => fetchData(), { retry: 3 }); // up to 3 retries (4 total attempts)
```

### Conditional retries with `shouldRetry`

Use `shouldRetry` to skip retries for specific error types. The predicate receives the error and the current attempt index (0-based):

```typescript
handleApi(() => fetchData(), {
  retry: 3,
  shouldRetry: (error, attempt) => {
    // Don't retry auth errors or client errors
    if (error.status === 401 || error.status === 403) return false;
    if (error.status && error.status >= 400 && error.status < 500) return false;
    return true;
  },
});
```

### Custom back-off strategy

Use `backoff` to provide a custom delay function. It receives the attempt index and should return the delay in milliseconds:

```typescript
handleApi(() => fetchData(), {
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
  const { data, handleApi } = useApiHandler<User>("user");

  useEffect(() => {
    // Won't refetch if the last successful fetch was less than 30 seconds ago
    handleApi(() => fetchUser(userId), { staleTime: 30_000 });
  }, [userId, handleApi]); // handleApi is stable — won't trigger extra fetches

  return <div>{data?.name}</div>;
}
```

The `staleTime` check uses the `fetchedAt` timestamp stored in each endpoint's state. You can also access `fetchedAt` directly from the hook result for custom freshness logic.

## Cache Invalidation

Use `invalidateApi` to mark a key's cache as stale without removing the existing data. The next `handleApi` call with `staleTime` will refetch instead of returning the cache:

```typescript
function UserSettings() {
  const { data, handleApi, invalidateApi } = useApiHandler<User>("user");

  const updateName = async (name: string) => {
    await saveUserName(name);
    // Mark the user cache as stale — data is still visible,
    // but the next fetch with staleTime will hit the server
    invalidateApi();
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
  const { data, handleApi } = useApiHandler<Post>("updatePost");

  const toggle = () => {
    const optimistic = { ...post, isFavorite: !post.isFavorite };

    handleApi(() => updatePost(post.id, { isFavorite: !post.isFavorite }), {
      optimisticData: optimistic,
      onError: () => {
        // The state has already been rolled back automatically
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
handleApi(() => fetchSlowEndpoint(), {
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
handleApi(() => fetchUser(1), { dedupe: true });

// In ComponentB (called at the same time)
handleApi(() => fetchUser(1), { dedupe: true });
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

handleApi(() => submitForm(data), {
  onSuccess: () => showToast("Saved!"),
  onError: (error) => showToast(`Failed: ${error.message}`),
  onSettled: () => setModalOpen(false), // always close the modal
});
```

`onSettled` is called after `onSuccess` or `onError`.

## Throw on Error

By default, `handleApi` resolves to `undefined` when a request fails. Use `throwOnError` to reject the promise with the `ApiError` instead, enabling `try/catch` patterns:

```typescript
try {
  const data = await handleApi(() => fetchUser(1), { throwOnError: true });
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
import {
  createApiStore,
  useApiHandler,
  createApiComposer,
} from "zustand-api-manager";

// Option A: use the pre-bound hooks returned by createApiStore
const {
  useStore,
  useApiHandler: useFeatureApi,
  useLoadingStates: useFeatureLoading,
  createApiComposer: createFeatureComposer,
} = createApiStore({ storageKey: "my-feature" });

function MyComponent() {
  // These are already bound to the custom store — no second argument needed
  const { data, handleApi } = useFeatureApi<User>("getUser");
  const isLoading = useFeatureLoading("getUser");
  // ...
}

// Option B: pass the store explicitly to the standalone hooks
const { useStore } = createApiStore({ storageKey: "my-feature" });

function MyComponent() {
  const { data, handleApi } = useApiHandler<User>("getUser", useStore);
  // ...
}

// Works with the composer too
const useApi = createApiComposer<MyApiStructure>(useStore);
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
  useApiHandler,
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
import React, { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";

function UserProfile() {
  const { data, isLoading, handleApi } = useApiHandler<User>("getUser");

  useEffect(() => {
    handleApi(() => fetchUser(1), { persist: true });
  }, [handleApi]);

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

- **Single subscription per hook** — `useApiHandler` and `createApiComposer` subscribe only to the state slice for the given key. Changes to unrelated keys don't trigger re-renders.
- **Stable function references** — `handleApi`, `resetApi`, and `invalidateApi` are wrapped in `useCallback` and only change when the `key` or `store` argument changes. This means they're safe to include in `useEffect` dependency arrays without causing infinite loops.
- **No extra subscriptions for store methods** — Store actions like `handleApi`, `resetApiState`, and `invalidateApi` are read via `getState()` inside callbacks rather than creating reactive subscriptions, reducing overhead.

## TypeScript Support

This package is written in TypeScript and provides strong typing out of the box.

- `ApiCallOptions<T>` is generic — `onSuccess` receives typed data, `optimisticData` is type-checked
- `useApiHandler<T>` returns a fully typed `ApiHandlerResult<T>`
- `createApiComposer<TApiStructure>()` infers parameter and response types for each endpoint
- All exported types are available: `ApiState`, `ApiError`, `ApiCallOptions`, `ApiEndpoint`, `ApiStore`, `ApiHandlerResult`, `ApiComposerResult`, `FetchStatus`, etc.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
