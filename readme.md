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
- [Optimistic Updates](#optimistic-updates)
- [Multiple Store Instances](#multiple-store-instances)
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
- Persistent state options
- Middleware support for customizing API call behavior
- Global error handling with unsubscribe support
- Request cancellation via `AbortSignal` (including mid-retry abort)
- Automatic retry with exponential back-off
- Race condition protection (stale responses are automatically discarded)
- Built-in caching via `staleTime` — skip refetches when data is fresh
- Optimistic updates with automatic rollback on error
- `fetchedAt` timestamp tracking for every endpoint
- SSR-safe (no `localStorage` access on the server)
- Factory function for multiple isolated store instances with pre-bound hooks
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
  }, []);

  if (isIdle) return <div>Ready to fetch</div>;
  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error occurred</div>;

  return <div>{data?.username}</div>;
}
```

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
  }, [postId]);

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
  }, []);

  if (isLoading) return <Spinner />;
  return <ul>{data?.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

## API Reference

### `useApiStore`

The default singleton store for managing API states. Provides the following methods:

- `setApiState(key, state, persist?)` — Update the state for a specific API key
- `resetApiState(key)` — Reset the state for a specific API key
- `handleApi(key, apiCall, options?)` — Handle an API call with automatic state management. Returns `Promise<T | undefined>` (the response data on success, `undefined` otherwise)
- `addMiddleware(middleware)` — Add middleware; returns an **unsubscribe** function
- `addErrorHandler(handler)` — Add a global error handler; returns an **unsubscribe** function

### `createApiStore(config?)`

Factory function that creates an isolated store instance **with pre-bound convenience hooks**. Useful for SSR, testing, or when you need multiple independent stores.

```typescript
import { createApiStore } from "zustand-api-manager";

const { useStore, useApiHandler, useLoadingStates, createApiComposer } =
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
- `handleApi(apiCall, options?)` — Trigger the API call. Returns `Promise<T | undefined>`
- `resetApi()` — Reset the API state

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

### `createApiComposer`

Creates a strongly-typed API composer. Returns a hook with all the same fields as `useApiHandler`, including `resetApi`, `status`, and `fetchedAt`. Accepts an optional store instance:

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
- `persist?: boolean` — persist this key's state to localStorage
- `signal?: AbortSignal` — abort the request (from an `AbortController`)
- `retry?: number` — number of retries on failure (default `0`, exponential back-off)
- `staleTime?: number` — skip the request if data was fetched within this many milliseconds
- `optimisticData?: T` — data to show immediately while the request is in-flight (rolled back on error)

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
  }, [userId]);

  return <div>{data?.name}</div>;
}
```

The `staleTime` check uses the `fetchedAt` timestamp stored in each endpoint's state. You can also access `fetchedAt` directly from the hook result for custom freshness logic.

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

## Multiple Store Instances

By default, all hooks use a shared singleton store. For SSR, testing, or isolated modules, create separate instances with `createApiStore`:

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
