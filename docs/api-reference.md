# API Reference

Complete API documentation for zustand-api-manager.

## Table of Contents

- [Hooks](#hooks)
  - [useApiQuery](#useapiquery)
  - [useApiMutation](#useapimutation)
  - [usePolling](#usepolling)
  - [usePrefetch](#useprefetch)
  - [useLoadingStates](#useloadingstates)
- [Store Methods](#store-methods)
- [Configuration](#configuration)
- [Types](#types)

## Hooks

### useApiQuery

Manages query operations (GET requests, read operations).

```typescript
const {
  data,
  status,
  isIdle,
  isLoading,
  isSuccess,
  isError,
  error,
  fetchedAt,
  query,
  reset,
  invalidate
} = useApiQuery<T>(key, store?)
```

**Parameters:**
- `key` (string): Unique identifier for the endpoint
- `store?` (optional): Custom store instance

**Returns:** `ApiHandlerResult<T>`

**Example:**
```typescript
const { data, isLoading, query } = useApiQuery<User>('user')

useEffect(() => {
  query(() => fetchUser(1), {
    staleTime: 60_000,
    retry: 2
  })
}, [query])
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
} = useApiMutation<T, V>(key, mutationFn, store?)
```

**Parameters:**
- `key` (string): Unique identifier
- `mutationFn` (function): `(variables: V) => Promise<{ data: T }>`
- `store?` (optional): Custom store instance

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
const result = usePolling<T>(
  key,
  apiCall,
  interval,
  options?,
  store?
)
```

**Parameters:**
- `key` (string): Unique identifier
- `apiCall` (function): API call function
- `interval` (number): Polling interval in milliseconds
- `options?` (object): Options with `immediate` and `enabled`
- `store?` (optional): Custom store instance

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
const { prefetch } = usePrefetch(store?)
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
const isLoading = useLoadingStates(keys?, store?)
```

**Parameters:**
- `keys?` (string | string[] | undefined): Keys to check
- `store?` (optional): Custom store instance

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

## Store Methods

### handleApi

Execute an API call with full lifecycle management.

```typescript
const data = await store.handleApi<T>(key, apiCall, options?)
```

### reset()State

Reset state for a specific key.

```typescript
store.reset()State(key)
```

### invalidate()

Mark a key's cache as stale.

```typescript
store.invalidate()(key)
```

### invalidate()s

Batch-invalidate multiple keys.

```typescript
store.invalidate()s(['user', 'posts', 'settings'])
```

### reset()States

Batch-reset multiple keys.

```typescript
store.reset()States(['user', 'posts'])
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

### createApiComposer

Create a type-safe API composer that supports both query and mutation endpoints. Both query and mutation functions are bound at composer creation time.

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

// Query usage - function is pre-bound, just pass params and options
const { data, query } = useApi('getUser')
query({ id: 1 })
query({ id: 1 }, { staleTime: 60_000 })

// Void-param query - no arguments needed
const { query: listQuery } = useApi('listPosts')
listQuery()

// Mutation usage - function is pre-bound
const { mutate, isLoading } = useApi('createPost')
mutate({ title: 'Hello', content: '...' })
```

**Key Differences:**
- **Query endpoints** (`ApiQueryEndpoint`) return `query`, `reset`, `invalidate`, and `fetchedAt`
- **Mutation endpoints** (`ApiMutationEndpoint`) return `mutate` and `reset` (no invalidate or fetchedAt)
- Both query and mutation functions are bound at composer creation via the `queries` and `mutations` config

**Query endpoints:**
- `query(params?, options?)` - Execute the query
- `reset()` - Reset the state
- `invalidate()` - Invalidate the cache

**Mutation endpoints:**
- `mutate(variables?, options?)` - Execute the mutation
- `reset()` - Reset the state

---

## Types

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

// Query hook
function UserProfile({ userId }: { userId: number }) {
  const { data, isLoading, query } = useApiQuery<User>('user')

  useEffect(() => {
    query(() => api.getUser(userId), {
      persist: true,
      staleTime: 60_000
    })
  }, [userId, query])

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
