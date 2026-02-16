# API Reference

Complete API documentation for zustand-api-manager.

## Table of Contents

- [Hooks](#hooks)
  - [useApiQuery](#useapiquery)
  - [useApiMutation](#useapimutation)
  - [usePolling](#usepolling)
  - [usePrefetch](#useprefetch)
  - [useLoadingStates](#useloadingstates)
- [Composer](#composer)
  - [createApiComposer](#createapicomposer)
- [Store Methods](#store-methods)
- [Configuration](#configuration)
- [Types](#types)

## Hooks

### useApiQuery

Manages query operations (GET requests, read operations). Supports two modes:

- **Declarative mode** — provide `queryFn` in options to auto-fetch on mount and when `key`/`enabled` changes
- **Observer mode** — omit options to read state without triggering a fetch

```typescript
// Declarative mode — auto-fetches
const { data, isLoading } = useApiQuery<T>(key, {
  queryFn: () => fetchData(),
  enabled: true,
  staleTime: 60_000
})

// Observer mode — read-only
const { data } = useApiQuery<T>(key)
```

**Parameters:**
- `key` (string): Unique identifier for the endpoint
- `options?` (`UseApiQueryOptions<T>`): Options including `queryFn`, `enabled`, and all `ApiCallOptions<T>`

**Returns:** `ApiQueryResult<T>`

| Field | Type | Description |
|-------|------|-------------|
| `data` | `T \| null` | Response data |
| `status` | `FetchStatus` | Raw status value |
| `isIdle` | `boolean` | No request made yet |
| `isLoading` | `boolean` | Request in progress |
| `isSuccess` | `boolean` | Last request succeeded |
| `isError` | `boolean` | Last request failed |
| `error` | `ApiError \| null` | Error from last failure |
| `fetchedAt` | `number \| null` | Timestamp of last success |
| `query` | `function` | Trigger fetch imperatively |
| `reset` | `function` | Reset state to idle |
| `invalidate` | `function` | Mark cache as stale |

**Declarative Example:**
```typescript
function UserProfile({ userId }: { userId: number }) {
  const { data, isLoading } = useApiQuery<User>('user', {
    queryFn: () => fetchUser(userId),
    staleTime: 60_000,
    retry: 2
  })

  if (isLoading) return <Loading />
  return <div>{data?.name}</div>
}
```

**Imperative Example:**
```typescript
const { query } = useApiQuery<User>('user')

const handleClick = async () => {
  const user = await query(() => fetchUser(1), { staleTime: 60_000 })
  console.log(user?.name)
}
```

---

### useApiMutation

Manages mutation operations (POST, PUT, DELETE, PATCH).

```typescript
const {
  data,
  status,
  isIdle,
  isLoading,
  isSuccess,
  isError,
  error,
  mutate,
  reset
} = useApiMutation<T, V>(key, mutationFn)
```

**Parameters:**
- `key` (string): Unique identifier
- `mutationFn` (function): `(variables: V) => Promise<{ data: T }>`

**Returns:** `ApiMutationResult<T, V>`

**Example:**
```typescript
const { mutate, isLoading } = useApiMutation<User, CreateUserPayload>(
  'createUser',
  (payload) => api.createUser(payload)
)

await mutate({ name: 'John', email: 'john@example.com' })
```

---

### usePolling

Polls an endpoint at regular intervals.

```typescript
const result = usePolling<T>(key, apiCall, interval, options?)
```

**Parameters:**
- `key` (string): Unique identifier
- `apiCall` (function): API call function
- `interval` (number): Polling interval in milliseconds
- `options?` (object): Options with `immediate` and `enabled`

**Options:**
- `immediate?: boolean` - Fire first request immediately
- `enabled?: boolean` - Toggle polling on/off
- Plus all `ApiCallOptions<T>`

**Example:**
```typescript
const { data } = usePolling<Notification[]>(
  'notifications',
  () => fetchNotifications(),
  10_000,
  { immediate: true, enabled: isActive }
)
```

---

### usePrefetch

Prefetches data without triggering UI updates.

```typescript
const { prefetch } = usePrefetch()
```

**Returns:** Object with `prefetch` function

**Example:**
```typescript
const { prefetch } = usePrefetch()

const handleMouseEnter = (id: number) => {
  prefetch(`user-${id}`, () => fetchUser(id), {
    staleTime: 60_000
  })
}
```

---

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

---

## Composer

### createApiComposer

Create a type-safe API composer that supports both query and mutation endpoints with declarative auto-fetching. Both query and mutation functions are bound at composer creation time.

```typescript
import {
  createApiComposer,
  ApiQueryEndpoint,
  ApiMutationEndpoint
} from 'zustand-api-manager'

interface MyApi {
  // Query endpoints (read operations)
  getUser: ApiQueryEndpoint<{ id: number }, User>
  listPosts: ApiQueryEndpoint<void, Post[]>

  // Mutation endpoints (write operations)
  createPost: ApiMutationEndpoint<CreatePostPayload, Post>
  updatePost: ApiMutationEndpoint<UpdatePostPayload, Post>
}

const useApi = createApiComposer<MyApi>({
  queries: {
    getUser: (params) => api.getUser(params),
    listPosts: () => api.listPosts()
  },
  mutations: {
    createPost: (payload) => api.createPost(payload),
    updatePost: (payload) => api.updatePost(payload)
  }
})
```

**Declarative mode** — pass options as second argument to auto-fetch:

```typescript
// With params
const { data } = useApi('getUser', { params: { id: 1 } })

// Void params
const { data } = useApi('listPosts', {})

// With enabled
const { data } = useApi('getUser', { params: { id: 1 }, enabled: isReady })
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
const { query: listQuery } = useApi('listPosts')
listQuery()

// Mutation
const { mutate, isLoading } = useApi('createPost')
mutate({ title: 'Hello', content: '...' })
```

**Key Differences:**
- **Query endpoints** (`ApiQueryEndpoint`) return `query`, `reset`, `invalidate`, and `fetchedAt`
- **Mutation endpoints** (`ApiMutationEndpoint`) return `mutate` and `reset` (no invalidate or fetchedAt)

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
  useApiQuery,
  useLoadingStates,
  usePolling,
  useApiMutation,
  usePrefetch,
  createApiComposer
} = createApiStore(config?)
```

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

### UseApiQueryOptions<T>

Options for `useApiQuery` declarative mode. Extends `ApiCallOptions<T>`.

```typescript
interface UseApiQueryOptions<T> extends ApiCallOptions<T> {
  queryFn?: () => Promise<{ data: T }>
  enabled?: boolean
}
```

### ComposerDeclarativeOptions

Conditional options type for declarative auto-fetching in the composer:

- For `ApiQueryEndpoint<P, R>` where `P extends void`: `{ enabled?: boolean } & Omit<ApiCallOptions<R>, 'signal' | 'optimisticData'>`
- For `ApiQueryEndpoint<P, R>` where P is not void: `{ params: P; enabled?: boolean } & Omit<ApiCallOptions<R>, 'signal' | 'optimisticData'>`
- For mutations: `never`

### ApiCallOptions<T>

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

**Example:**
```typescript
interface MyApi {
  getUser: ApiQueryEndpoint<{ id: number }, User>
  listPosts: ApiQueryEndpoint<void, Post[]>
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

**Example:**
```typescript
interface MyApi {
  createUser: ApiMutationEndpoint<CreateUserPayload, User>
  deletePost: ApiMutationEndpoint<{ id: number }, void>
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
import { useApiQuery, useApiMutation, configureApiStore } from 'zustand-api-manager'

// Configure global defaults
configureApiStore({
  defaultRetry: 2,
  defaultStaleTime: 30_000,
  onError: (error) => console.error(error)
})

// Declarative query hook
function UserProfile({ userId }: { userId: number }) {
  const { data, isLoading } = useApiQuery<User>('user', {
    queryFn: () => api.getUser(userId),
    persist: true,
    staleTime: 60_000
  })

  if (isLoading) return <Loading />
  return <div>{data?.name}</div>
}

// Mutation hook
function UpdateProfile() {
  const { mutate, isLoading } = useApiMutation<User, UpdatePayload>(
    'updateUser',
    (payload) => api.updateUser(payload)
  )

  const handleSubmit = async (data: UpdatePayload) => {
    await mutate(data, {
      onSuccess: () => console.log('Updated!'),
      optimisticData: { ...currentUser, ...data }
    })
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```
