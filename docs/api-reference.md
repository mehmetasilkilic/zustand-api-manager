# API Reference

Complete API documentation for zustand-api-manager.

## Table of Contents

- [Composer](#composer)
  - [createApiComposer](#createapicomposer)
  - [Polling](#polling)
  - [Prefetch](#prefetch)
  - [MutationEndpointConfig](#mutationendpointconfig)
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
  onError: (error, key) => {
    console.error(`${key} failed:`, error)
  }
})
```

---

## Types

### QueryKeys\<T\>

Extracts query endpoint keys from an API structure.

```typescript
type QueryKeys<T> = {
  [K in keyof T]: T[K] extends ApiQueryEndpoint<any, any> ? K : never
}[keyof T]

// Example: QueryKeys<MyApi> = 'getUser' | 'listUsers'
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

- For `ApiQueryEndpoint<P, R>` where `P extends void`: `{ enabled?: boolean; polling?: number } & Omit<ApiCallOptions<R>, 'signal' | 'optimisticData'>`
- For `ApiQueryEndpoint<P, R>` where P is not void: `{ params: P; enabled?: boolean; polling?: number } & Omit<ApiCallOptions<R>, 'signal' | 'optimisticData'>`
- For mutations: `never`

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
import { createApiComposer, ApiQueryEndpoint, ApiMutationEndpoint } from 'zustand-api-manager'

interface MyApi {
  listUsers: ApiQueryEndpoint<void, User[]>
  getUser: ApiQueryEndpoint<{ id: number }, User>
  createUser: ApiMutationEndpoint<CreateUserPayload, User>
  deleteUser: ApiMutationEndpoint<{ id: number }, void>
}

const useApi = createApiComposer<MyApi>({
  queries: {
    listUsers: () => api.listUsers(),
    getUser: (params) => api.getUser(params)
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

// Declarative query — auto-fetches
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
