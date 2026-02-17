# Zustand API Manager

[![npm version](https://img.shields.io/npm/v/zustand-api-manager.svg)](https://www.npmjs.com/package/zustand-api-manager)
[![downloads](https://img.shields.io/npm/dm/zustand-api-manager.svg)](https://www.npmjs.com/package/zustand-api-manager)
[![bundle size](https://img.shields.io/bundlephobia/minzip/zustand-api-manager)](https://bundlephobia.com/package/zustand-api-manager)
[![license](https://img.shields.io/npm/l/zustand-api-manager.svg)](https://github.com/mehmetasilkilic/zustand-api-manager/blob/main/LICENSE)
[![GitHub](https://img.shields.io/github/stars/mehmetasilkilic/zustand-api-manager?style=social)](https://github.com/mehmetasilkilic/zustand-api-manager)

A type-safe API layer for Zustand. Define your entire API as a typed interface, get one hook.

## Why This Instead of TanStack Query?

| | Zustand API Manager | TanStack Query |
|---|---|---|
| **One hook for your entire API** | `useApi('getUser', { params: { id } })` | Separate `useQuery` / `useMutation` per endpoint |
| **Declarative cache invalidation** | `invalidates: ['listUsers']` at definition | `queryClient.invalidateQueries()` imperative calls scattered across components |
| **Cross-endpoint optimistic updates** | `optimistic: { listUsers: (vars, data) => ... }` at definition | Manual `queryClient.setQueryData` + rollback boilerplate |
| **Built-in polling** | `polling: 10_000` declarative option | `refetchInterval` option |
| **Refetch on focus / reconnect** | `refetchOnWindowFocus: true` per query or global | `refetchOnWindowFocus` global default |
| **Infinite queries** | `ApiInfiniteQueryEndpoint` + `fetchNextPage` | `useInfiniteQuery` separate hook |
| **Garbage collection** | `gcTime` per query or global (default 5min) | `gcTime` per query (default 5min) |
| **Multi-store isolation** | `createApiStore()` — fully isolated per-feature stores | Single `QueryClient`, workarounds for isolation |
| **Zustand-native** | Built on Zustand — share state with your existing stores | Separate cache layer, doesn't integrate with Zustand |
| **Zero extra peer deps** | Only `zustand` + `react` | Only `react` |
| **Bundle size** | ~10KB gzipped | ~40KB gzipped |

## Quick Start

```bash
npm install zustand-api-manager zustand
```

```typescript
import {
  createApiComposer,
  ApiQueryEndpoint,
  ApiMutationEndpoint,
} from "zustand-api-manager";

// 1. Define your API structure
interface MyApi {
  listUsers: ApiQueryEndpoint<void, User[]>;
  getUser: ApiQueryEndpoint<{ id: number }, User>;
  createUser: ApiMutationEndpoint<CreateUserPayload, User>;
}

// 2. Create your hook with automatic invalidation + optimistic updates
const useApi = createApiComposer<MyApi>({
  queries: {
    listUsers: () => api.listUsers(),
    getUser: (params) => api.getUser(params),
  },
  mutations: {
    createUser: {
      fn: (payload) => api.createUser(payload),
      invalidates: ["listUsers"], // auto-refetch after success
      optimistic: {
        listUsers: (vars, current) => [
          ...(current ?? []),
          { id: Date.now(), ...vars },
        ],
      },
    },
  },
});

// 3. Use it
function UserList() {
  const { data, isLoading } = useApi("listUsers", {}); // auto-fetches on mount
  if (isLoading) return <Spinner />;
  return <ul>{data?.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}

function CreateUserForm() {
  const { mutate, isLoading } = useApi("createUser");
  // On mutate: listUsers updates optimistically, then refetches on success
  return (
    <button onClick={() => mutate({ name: "Alice", email: "alice@co.com" })}>
      {isLoading ? "Creating..." : "Create User"}
    </button>
  );
}
```

## Table of Contents

- [The Composer](#the-composer)
  - [Defining Your API Structure](#defining-your-api-structure)
  - [Queries — Declarative, Observer, Imperative](#queries--declarative-observer-imperative)
  - [Mutations](#mutations)
  - [Automatic Cache Invalidation](#automatic-cache-invalidation)
  - [Cross-Endpoint Optimistic Updates](#cross-endpoint-optimistic-updates)
  - [Dependent Queries (enabled pattern)](#dependent-queries-enabled-pattern)
  - [Polling](#polling)
  - [Refetch on Window Focus / Network Reconnect](#refetch-on-window-focus--network-reconnect)
  - [Garbage Collection](#garbage-collection)
  - [Infinite Queries](#infinite-queries)
  - [Prefetch](#prefetch)
- [Multi-Store Isolation](#multi-store-isolation)
- [Global Loading States](#global-loading-states-useloadingstates)
- [Configuration & Options](#configuration--options)
- [Middleware & Error Handling](#middleware--error-handling)
- [Store API Reference](#store-api-reference)
- [Comparison](#comparison)
- [Migration from TanStack Query / SWR / RTK Query](#migration-from-tanstack-query--swr--rtk-query)
- [Performance](#performance)
- [TypeScript Support](#typescript-support)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## The Composer

The composer is the way to use zustand-api-manager. Define your entire API as a typed interface, get one hook that handles everything.

### Defining Your API Structure

```typescript
import {
  createApiComposer,
  ApiQueryEndpoint,
  ApiMutationEndpoint,
} from "zustand-api-manager";

interface MyApi {
  // Queries (read operations)
  getUser: ApiQueryEndpoint<{ id: number }, User>;
  listUsers: ApiQueryEndpoint<void, User[]>;

  // Mutations (write operations)
  createUser: ApiMutationEndpoint<CreateUserPayload, User>;
  updateUser: ApiMutationEndpoint<UpdateUserPayload, User>;
  deleteUser: ApiMutationEndpoint<{ id: number }, void>;
}

const useApi = createApiComposer<MyApi>({
  queries: {
    getUser: (params) => api.getUser(params),
    listUsers: () => api.listUsers(),
  },
  mutations: {
    // Simple function
    deleteUser: (payload) => api.deleteUser(payload),
    // Config object with invalidation + optimistic
    createUser: {
      fn: (payload) => api.createUser(payload),
      invalidates: ["listUsers"],
      optimistic: {
        listUsers: (vars, current) => [
          ...(current ?? []),
          { id: Date.now(), ...vars },
        ],
      },
    },
  },
});
```

### Queries — Declarative, Observer, Imperative

**Declarative mode** — auto-fetches on mount and when params change:

```typescript
function UserProfile({ userId }: { userId: number }) {
  const { data, isLoading } = useApi("getUser", { params: { id: userId } });
  if (isLoading) return <Spinner />;
  return <div>{data?.name}</div>;
}

function UserList() {
  // void-param endpoints: pass empty options object
  const { data, isLoading } = useApi("listUsers", {});
  if (isLoading) return <Spinner />;
  return <ul>{data?.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

**Observer mode** — read state without triggering a fetch:

```typescript
function UserBadge() {
  const { data } = useApi("getUser"); // reads cached data, no fetch
  return <span>{data?.name}</span>;
}
```

**Imperative mode** — trigger fetches on demand:

```typescript
function SearchUser() {
  const { query, data } = useApi("getUser");

  const handleSearch = (id: number) => {
    query({ id }, { staleTime: 60_000 });
  };

  return <button onClick={() => handleSearch(1)}>Load User</button>;
}
```

### Mutations

```typescript
function CreateUser() {
  const { mutate, isLoading, data } = useApi("createUser");

  const handleSubmit = async () => {
    const user = await mutate(
      { name: "Alice", email: "alice@example.com" },
      {
        onSuccess: (user) => console.log("Created:", user),
        onError: (error) => console.error("Failed:", error),
      }
    );
  };

  return (
    <button onClick={handleSubmit} disabled={isLoading}>
      Create
    </button>
  );
}
```

### Automatic Cache Invalidation

Define which queries to invalidate when a mutation succeeds. The composer automatically refetches any active declarative queries for those keys:

```typescript
const useApi = createApiComposer<MyApi>({
  queries: {
    listUsers: () => api.listUsers(),
    getUser: (params) => api.getUser(params),
  },
  mutations: {
    createUser: {
      fn: (payload) => api.createUser(payload),
      invalidates: ["listUsers", "getUser"], // both refetch on success
    },
    deleteUser: {
      fn: (payload) => api.deleteUser(payload),
      invalidates: ["listUsers"],
    },
  },
});
```

**How it works:**
1. Mutation succeeds
2. `invalidateApis()` clears `fetchedAt` for each key in `invalidates`
3. Any currently-mounted declarative query for those keys is automatically refetched
4. Unmounted queries are invalidated (stale) but not refetched until re-mounted

### Cross-Endpoint Optimistic Updates

Show changes immediately while the mutation is in-flight. If the mutation fails, data rolls back automatically:

```typescript
const useApi = createApiComposer<MyApi>({
  queries: {
    listUsers: () => api.listUsers(),
  },
  mutations: {
    createUser: {
      fn: (payload) => api.createUser(payload),
      invalidates: ["listUsers"],
      optimistic: {
        // (mutationVariables, currentQueryData) => newQueryData
        listUsers: (vars, current) => [
          ...(current ?? []),
          { id: Date.now(), ...vars },
        ],
      },
    },
  },
});

// In the component:
// 1. mutate() is called
// 2. listUsers cache instantly shows the new user (optimistic)
// 3a. On success: invalidation refetches listUsers with server data
// 3b. On error: listUsers rolls back to previous data
```

### Dependent Queries (enabled pattern)

```typescript
function PostDetail({ postId, isReady }: { postId: number; isReady: boolean }) {
  const { data } = useApi("getPost", {
    params: { id: postId },
    enabled: isReady, // won't fetch until isReady is true
  });
  return <div>{data?.title}</div>;
}
```

### Polling

Add automatic polling to any declarative query with the `polling` option:

```typescript
function NotificationBell() {
  const { data } = useApi("getNotifications", {
    polling: 10_000, // Poll every 10 seconds
    enabled: isActive, // Pause when inactive
    staleTime: 5_000,
  });

  return <span>{data?.length ?? 0} notifications</span>;
}
```

**How it works:**
- The initial fetch fires immediately on mount
- After the polling interval, a new request fires — but only if the previous one has completed (no request stacking)
- Polling stops on unmount or when `enabled` becomes `false`
- All `ApiCallOptions` (staleTime, retry, etc.) apply to each poll tick

### Refetch on Window Focus / Network Reconnect

Automatically refetch stale data when the user returns to the tab or reconnects to the network:

```typescript
// Per-query opt-in
const { data } = useApi("listUsers", {
  refetchOnWindowFocus: true,  // refetch when tab becomes visible
  refetchOnReconnect: true,    // refetch when browser comes back online
});

// Or set globally for all declarative queries
configureApiStore({
  defaultRefetchOnWindowFocus: true,
  defaultRefetchOnReconnect: true,
});
```

**How it works:**
- `refetchOnWindowFocus` listens to `document.visibilitychange` and triggers a refetch when the page becomes visible
- `refetchOnReconnect` listens to the `window.online` event and triggers a refetch when the browser reconnects
- Both are opt-in per query or globally via `configureApiStore`
- SSR-safe: no-op when `window` is not available
- Cleanup is automatic on unmount

### Garbage Collection

Unmounted query caches are automatically cleaned up after a configurable delay. This prevents memory leaks from accumulated cache entries:

```typescript
// Per-query gcTime (default: 5 minutes)
const { data } = useApi("getUser", {
  params: { id: 1 },
  gcTime: 60_000, // clean up 1 minute after unmount
});

// Disable GC for a specific query
const { data } = useApi("getSettings", {
  gcTime: Infinity, // never garbage-collect
});

// Set globally
configureApiStore({
  defaultGcTime: 600_000, // 10 minutes for all queries
});
```

**How it works:**
1. When a declarative query unmounts, a GC timer starts
2. If the query re-mounts before the timer fires, the timer is cancelled
3. If the timer fires, the cache entry is deleted from the store
4. Default: 5 minutes (matching React Query)
5. Set `gcTime: Infinity` or `gcTime: 0` to disable

### Infinite Queries

Cursor-based pagination with `fetchNextPage`, `hasNextPage`, and automatic page tracking:

```typescript
import {
  createApiComposer,
  ApiInfiniteQueryEndpoint,
  ApiMutationEndpoint,
} from "zustand-api-manager";

interface MyApi {
  listPosts: ApiInfiniteQueryEndpoint<{ userId: number }, Post[], string>;
  createPost: ApiMutationEndpoint<CreatePostPayload, Post>;
}

const useApi = createApiComposer<MyApi>({
  infiniteQueries: {
    listPosts: {
      queryFn: (params, cursor) =>
        api.listPosts({ userId: params.userId, cursor }),
      getNextCursor: (lastPage) => lastPage.nextCursor ?? null,
    },
  },
  mutations: {
    createPost: {
      fn: (payload) => api.createPost(payload),
      invalidates: ["listPosts"], // re-fetches from first page on success
    },
  },
});

function PostFeed({ userId }: { userId: number }) {
  const { pages, hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } =
    useApi("listPosts", { params: { userId } });

  if (isLoading) return <Spinner />;

  return (
    <div>
      {pages.flat().map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? "Loading more..." : "Load More"}
        </button>
      )}
    </div>
  );
}
```

**Return values:**
- `pages` — Array of all fetched pages
- `pageParams` — Array of cursors used for each page
- `hasNextPage` — `true` if `getNextCursor(lastPage)` returns a non-null value
- `isFetchingNextPage` — `true` while `fetchNextPage()` is in progress
- `fetchNextPage(options?)` — Fetch the next page using the cursor from `getNextCursor`
- `reset()` / `invalidate()` — Standard query controls

### Prefetch

Preload data before it's needed using the static `prefetch` method:

```typescript
const useApi = createApiComposer<MyApi>({
  queries: {
    getUser: (params) => api.getUser(params),
  },
});

// Prefetch on hover — no hooks needed, works outside components
const handleMouseEnter = (userId: number) => {
  useApi.prefetch("getUser", { id: userId });
};

// Prefetch with options
useApi.prefetch("getUser", { id: 1 }, { staleTime: 60_000 });

// Prefetch void-param endpoints
useApi.prefetch("listUsers");
```

Prefetch silently populates the cache without calling `onSuccess`/`onError`/`onSettled` callbacks.

## Multi-Store Isolation

Create fully isolated store instances for per-feature or per-tenant isolation. Each store has its own state, race-condition tracking, and deduplication:

```typescript
import { createApiStore } from "zustand-api-manager";

const {
  useStore,
  useLoadingStates,
  createApiComposer,
} = createApiStore({ storageKey: "my-feature" });

// Bound composer — no need to pass the store argument
const useFeatureApi = createApiComposer<FeatureApi>({
  queries: { ... },
  mutations: { ... }
});
```

## Global Loading States (`useLoadingStates`)

Check loading state across arbitrary key subsets or multiple stores:

```typescript
import { useLoadingStates } from "zustand-api-manager";

function Dashboard() {
  const isAnyLoading = useLoadingStates(); // any API loading?
  const isUserOrPosts = useLoadingStates(["user", "posts"]); // specific keys
  const isUserLoading = useLoadingStates("user"); // single key

  return isAnyLoading ? <GlobalSpinner /> : <Content />;
}
```

## Configuration & Options

### `ApiCallOptions<T>`

Options for `query()`, `mutate()`, and `handleApi()`:

- `staleTime` — skip refetch if data is fresh (ms)
- `revalidateOnStale` — return stale data immediately, refetch in background
- `retry` / `shouldRetry` / `backoff` — retry with exponential backoff
- `signal` — `AbortSignal` for cancellation
- `timeout` — auto-abort after N ms (error code: `'TIMEOUT'`)
- `dedupe` — concurrent calls share a single in-flight promise
- `optimisticData` — show data immediately, rollback on error
- `throwOnError` — reject promise instead of resolving `undefined`
- `persist` — persist to localStorage
- `onStart`, `onCacheHit`, `onSuccess`, `onError`, `onBeforeRetry`, `onSettled` — lifecycle callbacks

### `configureApiStore`

Set global defaults:

```typescript
import { configureApiStore } from "zustand-api-manager";

configureApiStore({
  defaultRetry: 3,
  defaultStaleTime: 60_000,
  defaultTimeout: 30_000,
  defaultRefetchOnWindowFocus: true,
  defaultRefetchOnReconnect: true,
  defaultGcTime: 300_000, // 5 minutes (default)
  onError: (error, key) => console.error(`${key} failed:`, error),
});
```

## Middleware & Error Handling

```typescript
const store = useApiStore.getState();

// Middleware — returns unsubscribe function
const removeMiddleware = store.addMiddleware(
  (next) => async (key, apiCall, options) => {
    console.log(`[API] ${key} started`);
    await next(key, apiCall, options);
    console.log(`[API] ${key} finished`);
  }
);

// Global error handler — returns unsubscribe function
const removeHandler = store.addErrorHandler((error, key) => {
  console.error(`${key} failed:`, error.message);
});

// Cleanup
removeMiddleware();
removeHandler();
```

## Store API Reference

### `useApiStore`

The default singleton store. Methods:

- `handleApi(key, apiCall, options?)` — execute API call with lifecycle management
- `setApiState(key, state, persist?)` — update state for a key
- `resetApiState(key)` / `resetApiStates(keys)` / `resetAll()` — reset state
- `invalidateApi(key)` / `invalidateApis(keys)` / `invalidateAll()` — mark cache as stale
- `cancelRequest(key)` / `cancelAll()` — cancel in-flight requests
- `addMiddleware(middleware)` — returns unsubscribe function
- `addErrorHandler(handler)` — returns unsubscribe function

### `createApiStore(config?)`

Factory for isolated store instances:

```typescript
const {
  useStore,
  useLoadingStates,
  createApiComposer,
} = createApiStore({
  storageKey: "my-app-api",
  storage: customStorage, // optional async storage backend
  enableDevtools: true,
});
```

## Comparison

| Feature | Zustand API Manager | React Query | SWR | RTK Query |
|---------|:------------------:|:-----------:|:---:|:---------:|
| Bundle Size (gzip) | ~10KB | ~40KB | ~12KB | ~35KB |
| TypeScript | Yes | Yes | Yes | Yes |
| Queries + Mutations | Yes | Yes | Partial | Yes |
| Caching + staleTime | Yes | Yes | Yes | Yes |
| Polling | Yes | Yes | Yes | Yes |
| Retry + Backoff | Yes | Yes | Yes | Yes |
| Optimistic Updates | Yes | Yes | Yes | Yes |
| Prefetch | Yes | Yes | Yes | Yes |
| **Composer (one hook for entire API)** | **Yes** | No | No | Partial |
| **Declarative invalidation** | **Yes** | No | No | Tags (less flexible) |
| **Cross-endpoint optimistic** | **Yes** | Manual | Manual | Manual |
| **Multi-store isolation** | **Yes** | Partial | No | No |
| Infinite Queries | Yes | Yes | No | No |
| Refetch on Focus / Reconnect | Yes | Yes | Yes | Yes |
| Garbage Collection | Yes | Yes | No | Yes |
| Deduplication | Yes | Yes | Yes | Yes |
| DevTools | Yes | Yes | No | Yes |
| Learning Curve | Easy | Medium | Easy | Hard |

## Migration from TanStack Query / SWR / RTK Query

See the [Migration Guide](./docs/migration.md) for detailed instructions.

**Quick comparison:**

```typescript
// TanStack Query
const { data } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
const mutation = useMutation({ mutationFn: createUser,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
});

// Zustand API Manager (composer)
const { data } = useApi('listUsers', {});
const { mutate } = useApi('createUser');
// invalidation is declarative — defined once at the composer level
```

## Performance

- **Single subscription per hook** — only the state slice for the given key triggers re-renders
- **Stable function references** — `query`, `reset`, `invalidate`, `mutate` are wrapped in `useCallback`
- **No extra subscriptions** — store methods read via `getState()` inside callbacks
- **Declarative auto-fetch uses refs** — only `key`, `enabled`, and serialized `params` trigger refetches
- **Normalization at creation time** — mutation configs are normalized once, not per-render

## TypeScript Support

Full type safety out of the box:

- `createApiComposer<TApiStructure>()` infers parameter and response types per endpoint
- `ApiCallOptions<T>` — typed `onSuccess`, type-checked `optimisticData`
- `MutationEndpointConfig<TApi, V, R>` — type-safe `invalidates` (only query keys) and `optimistic` updaters
- `QueryKeys<T>` — extracts query key names from your API structure (includes infinite queries)
- `OptimisticUpdaters<TApi, V>` — typed optimistic updater functions
- `ApiInfiniteQueryEndpoint<P, R, C>` — typed infinite query endpoints with cursor type
- `InfiniteData<R, C>` — typed page and cursor arrays
- `ApiComposerInfiniteQueryResult<R, P, C>` — typed infinite query return values
- All exported types: `ApiState`, `ApiError`, `FetchStatus`, `ApiQueryResult`, `ApiMutationResult`, etc.

## Persistence in React Native

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createApiStore } from "zustand-api-manager";

const { useStore, createApiComposer } = createApiStore({
  storageKey: "my-app-api",
  storage: {
    getItem: (name) => AsyncStorage.getItem(name),
    setItem: (name, value) => AsyncStorage.setItem(name, value),
    removeItem: (name) => AsyncStorage.removeItem(name),
  },
});
```

## Documentation

- [API Reference](./docs/api-reference.md) — Complete API documentation
- [Migration Guide](./docs/migration.md) — Migrating from React Query, SWR, RTK Query
- [Troubleshooting](./docs/troubleshooting.md) — Common issues and solutions
- [Performance Guide](./docs/performance.md) — Optimization best practices
- [Examples](./examples) — Real-world usage examples

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
