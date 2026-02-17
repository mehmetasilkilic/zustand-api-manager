# API Reference

Complete API documentation for zustand-api-manager.

## Table of Contents

- [Composer](#composer)
  - [createApiComposer](#createapicomposer)
  - [Polling](#polling)
  - [Refetch on Window Focus / Reconnect](#refetch-on-window-focus--reconnect)
  - [Garbage Collection](#garbage-collection)
  - [Infinite Queries](#infinite-queries)
  - [Prefetch](#prefetch)
  - [MutationEndpointConfig](#mutationendpointconfig)
- [Focus Manager](#focus-manager)
- [Hooks](#hooks)
  - [useLoadingStates](#useloadingstates)
- [Store Methods](#store-methods)
- [Configuration](#configuration)
- [Types](#types)

## Composer

### createApiComposer

Create a type-safe API composer — one hook for your entire API. Supports query and mutation endpoints with declarative auto-fetching, polling, prefetch, automatic cache invalidation, and cross-endpoint optimistic updates.

```typescript
import {
  createApiComposer,
  ApiQueryEndpoint,
  ApiMutationEndpoint
} from 'zustand-api-manager'

interface MyApi {
  // Query endpoints (read operations)
  getUser: ApiQueryEndpoint<{ id: number }, User>
  listUsers: ApiQueryEndpoint<void, User[]>

  // Mutation endpoints (write operations)
  createUser: ApiMutationEndpoint<CreateUserPayload, User>
  updateUser: ApiMutationEndpoint<UpdateUserPayload, User>
  deleteUser: ApiMutationEndpoint<{ id: number }, void>
}

const useApi = createApiComposer<MyApi>({
  queries: {
    getUser: (params) => api.getUser(params),
    listUsers: () => api.listUsers()
  },
  mutations: {
    // Bare function (backward compatible)
    deleteUser: (payload) => api.deleteUser(payload),

    // Config object with invalidation + optimistic updates
    createUser: {
      fn: (payload) => api.createUser(payload),
      invalidates: ['listUsers'],
      optimistic: {
        listUsers: (vars, current) => [...(current ?? []), { id: Date.now(), ...vars }]
      }
    }
  }
})
```

**Declarative mode** — pass options as second argument to auto-fetch:

```typescript
// With params
const { data } = useApi('getUser', { params: { id: 1 } })

// Void params
const { data } = useApi('listUsers', {})

// With enabled
const { data } = useApi('getUser', { params: { id: 1 }, enabled: isReady })

// Forward ApiCallOptions
const { data } = useApi('listUsers', { staleTime: 60_000, retry: 2 })
```

**Observer mode** — omit second argument:

```typescript
const { data } = useApi('getUser') // reads state without fetching
```

**Imperative mode:**

```typescript
const { query } = useApi('getUser')
query({ id: 1 })
query({ id: 1 }, { staleTime: 60_000 })

// Void-param query
const { query: listQuery } = useApi('listUsers')
listQuery()

// Mutation
const { mutate, isLoading } = useApi('createUser')
mutate({ title: 'Hello', content: '...' })
```

**Key Differences:**
- **Query endpoints** (`ApiQueryEndpoint`) return `query`, `reset`, `invalidate`, and `fetchedAt`
- **Mutation endpoints** (`ApiMutationEndpoint`) return `mutate` and `reset` (no invalidate or fetchedAt)

---

### Polling

Add `polling` to declarative options to poll an endpoint at a regular interval.

```typescript
const { data } = useApi('listUsers', {
  polling: 10_000,       // poll every 10 seconds
  enabled: isActive,     // pause/resume polling
  staleTime: 5_000       // skip if data is fresh
})
```

**Options:**
- `polling` (number): Interval in milliseconds between fetches
- `enabled` (boolean): Set to `false` to pause polling. Defaults to `true`.

**Behavior:**
- The initial fetch fires immediately (declarative auto-fetch)
- Subsequent fetches fire at the given interval
- A tick is skipped if the previous request is still loading
- Polling stops on unmount or when `enabled` becomes `false`
- `staleTime` is respected — if data is still fresh, the tick is a no-op

---

### Refetch on Window Focus / Reconnect

Opt-in per query or globally to refetch when the user returns to the tab or reconnects to the network.

```typescript
// Per-query
const { data } = useApi('listUsers', {
  refetchOnWindowFocus: true,
  refetchOnReconnect: true
})

// Global defaults
configureApiStore({
  defaultRefetchOnWindowFocus: true,
  defaultRefetchOnReconnect: true
})
```

**Options:**
- `refetchOnWindowFocus` (boolean): Refetch when `document.visibilityState` becomes `'visible'`. Defaults to `false` (or the global default).
- `refetchOnReconnect` (boolean): Refetch when the `window.online` event fires. Defaults to `false` (or the global default).

**Behavior:**
- Only applies to declarative queries (second argument provided)
- Subscribes to DOM events on mount, unsubscribes on unmount
- SSR-safe: no-op when `window` is not available
- The global default is overridden by the per-query option

---

### Garbage Collection

Unmounted declarative query caches are automatically cleaned up after a configurable delay.

```typescript
// Per-query
const { data } = useApi('getUser', {
  params: { id: 1 },
  gcTime: 60_000  // clean up 1 minute after unmount
})

// Disable GC for a query
const { data } = useApi('getSettings', { gcTime: Infinity })

// Global default
configureApiStore({ defaultGcTime: 600_000 })  // 10 minutes
```

**Options:**
- `gcTime` (number): Milliseconds to wait before cleaning up an unmounted query's cache. Defaults to `300_000` (5 minutes, matching React Query).

**Behavior:**
- When a declarative query unmounts, a GC timer starts
- If the query re-mounts before the timer fires, the timer is cancelled (no data loss)
- If the timer fires, `store.resetApiState(cacheKey)` is called
- Set `gcTime: Infinity` or `gcTime: 0` to disable GC
- Resolution order: per-query `gcTime` > `configureApiStore({ defaultGcTime })` > `300_000`

---

### Infinite Queries

Cursor-based paginated queries with automatic page tracking.

```typescript
import {
  createApiComposer,
  ApiInfiniteQueryEndpoint
} from 'zustand-api-manager'

interface MyApi {
  listPosts: ApiInfiniteQueryEndpoint<{ userId: number }, Post[], string>
}

const useApi = createApiComposer<MyApi>({
  infiniteQueries: {
    listPosts: {
      queryFn: (params, cursor) => api.listPosts({ userId: params.userId, cursor }),
      getNextCursor: (lastPage) => lastPage.nextCursor ?? null,
      initialCursor: undefined  // optional, defaults to undefined
    }
  }
})
```

**Config fields:**
- `queryFn(params, cursor)` — Fetch a single page. `cursor` is `undefined` for the first page.
- `getNextCursor(lastPage)` — Extract the next cursor from the last fetched page. Return `null` or `undefined` to signal no more pages.
- `initialCursor?` — The cursor for the first page. Defaults to `undefined`.

**Declarative mode:**
```typescript
const {
  pages,              // R[] — all fetched pages
  pageParams,         // (C | undefined)[] — cursor for each page
  hasNextPage,        // boolean — getNextCursor(lastPage) != null
  isFetchingNextPage, // boolean — fetchNextPage() in progress
  fetchNextPage,      // (options?) => Promise<InfiniteData<R, C> | undefined>
  isLoading,          // boolean — first load
  isFetching,         // boolean — any fetch in progress
  isSuccess,
  isError,
  error,
  fetchedAt,
  reset,
  invalidate
} = useApi('listPosts', { params: { userId: 1 } })
```

**`fetchNextPage(options?)`**

Fetches the next page using the cursor from `getNextCursor(lastPage)`. Appends the result to `pages` and `pageParams`. Accepts optional `ApiCallOptions`.

**Invalidation:**

When a mutation with `invalidates: ['listPosts']` succeeds, the infinite query refetches from the first page (reset behavior).

**Supported declarative options:** `params`, `enabled`, `polling`, `refetchOnWindowFocus`, `refetchOnReconnect`, `gcTime`.

---

### Prefetch

Use `useApi.prefetch()` to preload data before a component mounts. This is a static method on the composer hook — it works outside of React components.

```typescript
// Prefetch with params
useApi.prefetch('getUser', { id: 42 })

// Prefetch with options
useApi.prefetch('getUser', { id: 42 }, { staleTime: 60_000 })

// Prefetch a void-param endpoint
useApi.prefetch('listUsers')

// Prefetch on hover
<button onMouseEnter={() => useApi.prefetch('getUser', { id: nextId })}>
  View User
</button>
```

**Signature:**
```typescript
useApi.prefetch(key, params?, options?)
```

**Parameters:**
- `key` — The query endpoint key to prefetch
- `params` — Parameters for the query function (omit for void-param endpoints)
- `options` — `ApiCallOptions` (e.g., `staleTime`, `retry`)

**Notes:**
- Only works for query endpoints
- Does not trigger React re-renders — it populates the cache in the store
- Subsequent declarative or imperative calls for the same key will use cached data if still fresh

---

### MutationEndpointConfig

Extended mutation configuration object for the composer. Supports automatic cache invalidation and cross-endpoint optimistic updates.

```typescript
interface MutationEndpointConfig<TApi, V, R> {
  fn: (variables: V) => Promise<{ data: R }>
  invalidates?: QueryKeys<TApi>[]
  optimistic?: OptimisticUpdaters<TApi, V>
}
```

**Fields:**
- `fn` — The mutation function to call
- `invalidates` — Array of query keys to invalidate on mutation success. Only query endpoint keys are accepted (type-safe). Active declarative queries for invalidated keys are automatically refetched.
- `optimistic` — Map of query keys to updater functions. Each updater receives `(mutationVariables, currentQueryData)` and returns the new data to display immediately. On mutation error, data rolls back to the snapshot taken before the optimistic update.

**Behavior:**
1. `mutate()` is called
2. Optimistic updaters run immediately, snapshotting previous data
3. `handleApi()` executes the mutation
4. On success: `invalidateApis()` clears caches, active declarative queries refetch
5. On error: optimistic snapshots are restored (rollback)

---

## Focus Manager

Low-level utilities for subscribing to browser focus and network events. These are used internally by the composer, but exported for advanced use cases.

```typescript
import { onWindowFocus, onReconnect } from 'zustand-api-manager'
```

### onWindowFocus

Subscribe to window focus (tab visibility) events.

```typescript
const unsubscribe = onWindowFocus(() => {
  console.log('Tab became visible')
})

// Later: stop listening
unsubscribe()
```

- Fires when `document.visibilityState` becomes `'visible'`
- Lazily attaches the DOM listener on first subscriber, removes on last unsubscribe
- SSR-safe: returns a no-op if `window`/`document` is not available

### onReconnect

Subscribe to network reconnect events.

```typescript
const unsubscribe = onReconnect(() => {
  console.log('Back online')
})

unsubscribe()
```

- Fires on the `window.online` event
- Same lazy listener management and SSR safety as `onWindowFocus`

---

## Hooks

### useLoadingStates

Checks loading state for one or more keys.

```typescript
const isLoading = useLoadingStates(keys?)
```

**Parameters:**
- `keys?` (string | string[] | undefined): Keys to check

**Returns:** `boolean`

**Examples:**
```typescript
// Check all keys
const isAnyLoading = useLoadingStates()

// Check specific key
const isUserLoading = useLoadingStates('user')

// Check multiple keys
const isDataLoading = useLoadingStates(['user', 'posts'])
```

**With multi-store:**
```typescript
const secondStore = createApiStore({ storageKey: 'second' })

// Check loading for the second store
const isLoading = secondStore.useLoadingStates('comments')
```

---

## Store Methods

### handleApi

Execute an API call with full lifecycle management.

```typescript
const data = await store.handleApi<T>(key, apiCall, options?)
```

### resetApiState

Reset state for a specific key.

```typescript
store.resetApiState(key)
```

### invalidateApi

Mark a key's cache as stale.

```typescript
store.invalidateApi(key)
```

### invalidateApis

Batch-invalidate multiple keys.

```typescript
store.invalidateApis(['user', 'posts', 'settings'])
```

### resetApiStates

Batch-reset multiple keys.

```typescript
store.resetApiStates(['user', 'posts'])
```

### resetAll

Reset all API states.

```typescript
store.resetAll()
```

### invalidateAll

Invalidate all caches.

```typescript
store.invalidateAll()
```

### cancelAll

Cancel all in-flight requests.

```typescript
store.cancelAll()
```

### cancelRequest

Cancel a specific request.

```typescript
store.cancelRequest(key)
```

### addMiddleware

Add middleware to the request chain.

```typescript
const unsubscribe = store.addMiddleware((next) => async (key, apiCall, options) => {
  console.log(`Starting ${key}`)
  await next(key, apiCall, options)
  console.log(`Finished ${key}`)
})

// Remove later
unsubscribe()
```

### addErrorHandler

Add a global error handler.

```typescript
const unsubscribe = store.addErrorHandler((error, key) => {
  console.error(`${key} failed:`, error)
})
```

---

## Configuration

### createApiStore

Create an isolated store instance.

```typescript
const {
  useStore,
  useLoadingStates,
  createApiComposer
} = createApiStore(config?)
```

**Returns:**
- `useStore` — The Zustand store hook for direct access
- `useLoadingStates` — Bound `useLoadingStates` for this store
- `createApiComposer` — Bound `createApiComposer` that uses this store

**Config Options:**
- `storageKey?` (string): localStorage key
- `storage?` (object): Custom storage backend
- `enableDevtools?` (boolean): Enable Zustand DevTools
- `devtoolsName?` (string): DevTools display name

---

### configureApiStore

Set global defaults.

```typescript
import { configureApiStore } from 'zustand-api-manager'

configureApiStore({
  defaultRetry: 3,
  defaultStaleTime: 60_000,
  defaultTimeout: 30_000,
  defaultRefetchOnWindowFocus: true,
  defaultRefetchOnReconnect: true,
  defaultGcTime: 300_000,
  onError: (error, key) => {
    console.error(`${key} failed:`, error)
  }
})
```

---

## Types

### QueryKeys\<T\>

Extracts query endpoint keys (including infinite queries) from an API structure.

```typescript
type QueryKeys<T> = {
  [K in keyof T]: T[K] extends ApiQueryEndpoint<any, any>
    ? K
    : T[K] extends ApiInfiniteQueryEndpoint<any, any, any>
      ? K
      : never
}[keyof T]

// Example: QueryKeys<MyApi> = 'getUser' | 'listUsers' | 'listPosts'
```

### OptimisticUpdaters\<TApi, V\>

Map of optimistic updater functions keyed by query endpoint name.

```typescript
type OptimisticUpdaters<TApi, V> = {
  [Q in QueryKeys<TApi>]?: TApi[Q] extends ApiQueryEndpoint<any, infer QR>
    ? (variables: V, currentData: QR | null) => QR
    : never
}
```

### MutationEndpointConfig\<TApi, V, R\>

Extended mutation definition with invalidation and optimistic updates.

```typescript
interface MutationEndpointConfig<TApi, V, R> {
  fn: (variables: V) => Promise<{ data: R }>
  invalidates?: QueryKeys<TApi>[]
  optimistic?: OptimisticUpdaters<TApi, V>
}
```

### ComposerDeclarativeOptions

Conditional options type for declarative auto-fetching in the composer:

- For `ApiQueryEndpoint<P, R>` where `P extends void`: `DeclarativeExtras & Omit<ApiCallOptions<R>, 'signal' | 'optimisticData'>`
- For `ApiQueryEndpoint<P, R>` where P is not void: `{ params: P } & DeclarativeExtras & Omit<ApiCallOptions<R>, 'signal' | 'optimisticData'>`
- For `ApiInfiniteQueryEndpoint<P, R, C>` where `P extends void`: `DeclarativeExtras`
- For `ApiInfiniteQueryEndpoint<P, R, C>` where P is not void: `{ params: P } & DeclarativeExtras`
- For mutations: `never`

**DeclarativeExtras:**
- `enabled?: boolean` — Pause/resume auto-fetching. Defaults to `true`.
- `polling?: number` — Poll interval in milliseconds (queries only).
- `refetchOnWindowFocus?: boolean` — Refetch when tab becomes visible.
- `refetchOnReconnect?: boolean` — Refetch when browser comes back online.
- `gcTime?: number` — Milliseconds before unmounted cache is garbage-collected.

### ApiCallOptions\<T\>

```typescript
interface ApiCallOptions<T> {
  onStart?: () => void
  onCacheHit?: (data: T) => void
  onSuccess?: (data: T) => void
  onError?: (error: ApiError) => void
  onBeforeRetry?: (error: ApiError, attempt: number) => void
  onSettled?: () => void
  persist?: boolean
  signal?: AbortSignal
  retry?: number
  shouldRetry?: (error: ApiError, attempt: number) => boolean
  backoff?: (attempt: number) => number
  staleTime?: number
  revalidateOnStale?: boolean
  optimisticData?: T
  timeout?: number
  dedupe?: boolean
  throwOnError?: boolean
}
```

### ApiQueryEndpoint

Defines a query endpoint (GET, read operations) for the composer.

```typescript
interface ApiQueryEndpoint<P, R> {
  _type: 'query'
  params: P
  response: R
}
```

### ApiMutationEndpoint

Defines a mutation endpoint (POST, PUT, DELETE, PATCH) for the composer.

```typescript
interface ApiMutationEndpoint<V, R> {
  _type: 'mutation'
  variables: V
  response: R
}
```

### ApiInfiniteQueryEndpoint

Defines a cursor-based infinite query endpoint for the composer.

```typescript
interface ApiInfiniteQueryEndpoint<P, R, C = unknown> {
  _type: 'infiniteQuery'
  params: P
  response: R   // per-page response type
  cursor: C     // cursor type
}
```

### InfiniteData

The data shape stored for infinite queries.

```typescript
interface InfiniteData<R, C = unknown> {
  pages: R[]
  pageParams: (C | undefined)[]
}
```

### ApiComposerInfiniteQueryResult

Result type returned when accessing an infinite query endpoint via the composer.

```typescript
interface ApiComposerInfiniteQueryResult<R, P, C> {
  pages: R[]
  pageParams: (C | undefined)[]
  status: FetchStatus
  isFetching: boolean
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  isSuccess: boolean
  isError: boolean
  error: ApiError | null
  fetchedAt: number | null
  fetchNextPage: (options?: ApiCallOptions<InfiniteData<R, C>>) => Promise<InfiniteData<R, C> | undefined>
  reset: () => void
  invalidate: () => void
}
```

### FetchStatus

```typescript
const FetchStatus = {
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR'
} as const
```

### ApiError

```typescript
interface ApiError extends Error {
  status?: number
  code?: string
}
```

---

## Complete Example

```typescript
import {
  createApiComposer,
  configureApiStore,
  ApiQueryEndpoint,
  ApiMutationEndpoint,
  ApiInfiniteQueryEndpoint
} from 'zustand-api-manager'

// Global defaults
configureApiStore({
  defaultRefetchOnWindowFocus: true,
  defaultRefetchOnReconnect: true,
  defaultGcTime: 300_000
})

interface MyApi {
  listUsers: ApiQueryEndpoint<void, User[]>
  getUser: ApiQueryEndpoint<{ id: number }, User>
  listPosts: ApiInfiniteQueryEndpoint<{ userId: number }, Post[], string>
  createUser: ApiMutationEndpoint<CreateUserPayload, User>
  deleteUser: ApiMutationEndpoint<{ id: number }, void>
}

const useApi = createApiComposer<MyApi>({
  queries: {
    listUsers: () => api.listUsers(),
    getUser: (params) => api.getUser(params)
  },
  infiniteQueries: {
    listPosts: {
      queryFn: (params, cursor) => api.listPosts({ userId: params.userId, cursor }),
      getNextCursor: (lastPage) => lastPage.nextCursor ?? null
    }
  },
  mutations: {
    createUser: {
      fn: (payload) => api.createUser(payload),
      invalidates: ['listUsers'],
      optimistic: {
        listUsers: (vars, current) => [...(current ?? []), { id: Date.now(), ...vars }]
      }
    },
    deleteUser: {
      fn: (payload) => api.deleteUser(payload),
      invalidates: ['listUsers'],
      optimistic: {
        listUsers: (vars, current) => (current ?? []).filter(u => u.id !== vars.id)
      }
    }
  }
})

// Declarative query — auto-fetches, refetches on focus/reconnect
function UserList() {
  const { data, isLoading } = useApi('listUsers', {})
  if (isLoading) return <Loading />
  return <ul>{data?.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}

// Polling — auto-refreshes every 30s
function LiveUserList() {
  const { data } = useApi('listUsers', { polling: 30_000 })
  return <ul>{data?.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}

// Infinite query — cursor-based pagination
function PostFeed({ userId }: { userId: number }) {
  const { pages, hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } =
    useApi('listPosts', { params: { userId } })

  if (isLoading) return <Loading />
  return (
    <div>
      {pages.flat().map(post => <PostCard key={post.id} post={post} />)}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading more...' : 'Load More'}
        </button>
      )}
    </div>
  )
}

// Prefetch on hover, load on click
function UserLink({ id }: { id: number }) {
  return (
    <button
      onMouseEnter={() => useApi.prefetch('getUser', { id })}
      onClick={() => navigate(`/users/${id}`)}
    >
      View User
    </button>
  )
}

// Mutation — creates user, listUsers updates optimistically then refetches
function CreateUser() {
  const { mutate, isLoading } = useApi('createUser')
  return (
    <button onClick={() => mutate({ name: 'Alice', email: 'alice@co.com' })}>
      {isLoading ? 'Creating...' : 'Create'}
    </button>
  )
}
```
