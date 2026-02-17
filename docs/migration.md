# Migration Guide

Guide for migrating from other data fetching libraries.

## The Composer

zustand-api-manager uses `createApiComposer` — one hook for your entire API with type-safe invalidation, optimistic updates, polling, and prefetch built in:

```typescript
import { createApiComposer, ApiQueryEndpoint, ApiMutationEndpoint } from 'zustand-api-manager'

interface MyApi {
  listUsers: ApiQueryEndpoint<void, User[]>
  getUser: ApiQueryEndpoint<{ id: number }, User>
  createUser: ApiMutationEndpoint<CreateUserPayload, User>
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
    }
  }
})
```

---

## From React Query / TanStack Query

### Query Hook

**React Query:**
```typescript
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
  staleTime: 60_000
})
```

**Zustand API Manager:**
```typescript
const { data, isLoading, error } = useApi('getUser', {
  params: { id: userId },
  staleTime: 60_000
})
```

### Polling

**React Query:**
```typescript
const { data } = useQuery({
  queryKey: ['notifications'],
  queryFn: fetchNotifications,
  refetchInterval: 10_000
})
```

**Zustand API Manager:**
```typescript
const { data } = useApi('getNotifications', {
  polling: 10_000,
  enabled: isActive
})
```

### Prefetch

**React Query:**
```typescript
queryClient.prefetchQuery({
  queryKey: ['user', id],
  queryFn: () => fetchUser(id)
})
```

**Zustand API Manager:**
```typescript
useApi.prefetch('getUser', { id })
```

### Mutation with Invalidation

**React Query:**
```typescript
const mutation = useMutation({
  mutationFn: createUser,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['users'] })
  }
})

mutation.mutate({ name: 'John' })
```

**Zustand API Manager (declarative invalidation):**
```typescript
// Defined ONCE at composer level:
const useApi = createApiComposer<MyApi>({
  queries: { listUsers: () => api.listUsers() },
  mutations: {
    createUser: {
      fn: (payload) => api.createUser(payload),
      invalidates: ['listUsers'] // automatic on success
    }
  }
})

// In component — no manual invalidation needed:
const { mutate } = useApi('createUser')
mutate({ name: 'John' })
```

### Optimistic Updates

**React Query:**
```typescript
const mutation = useMutation({
  mutationFn: createUser,
  onMutate: async (newUser) => {
    await queryClient.cancelQueries({ queryKey: ['users'] })
    const previous = queryClient.getQueryData(['users'])
    queryClient.setQueryData(['users'], (old) => [...old, newUser])
    return { previous }
  },
  onError: (err, newUser, context) => {
    queryClient.setQueryData(['users'], context.previous)
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['users'] })
  }
})
```

**Zustand API Manager (declarative optimistic):**
```typescript
// Defined ONCE at composer level — rollback is automatic:
const useApi = createApiComposer<MyApi>({
  queries: { listUsers: () => api.listUsers() },
  mutations: {
    createUser: {
      fn: (payload) => api.createUser(payload),
      invalidates: ['listUsers'],
      optimistic: {
        listUsers: (vars, current) => [...(current ?? []), { id: Date.now(), ...vars }]
      }
    }
  }
})

// In component — just mutate:
const { mutate } = useApi('createUser')
mutate({ name: 'John', email: 'john@co.com' })
```

### Observer Pattern

**React Query:**
```typescript
// Multiple components using same queryKey auto-share data
const { data } = useQuery({ queryKey: ['user'] })
```

**Zustand API Manager:**
```typescript
// Component A: owns the fetch (declarative mode)
const { data } = useApi('getUser', { params: { id: 1 } })

// Component B: reads the same data (observer mode)
const { data } = useApi('getUser')
```

### Refetch on Focus

**React Query:**
```typescript
// On by default globally via QueryClient
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true } }
})

// Per-query override
const { data } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
  refetchOnWindowFocus: false
})
```

**Zustand API Manager:**
```typescript
// Global default
configureApiStore({ defaultRefetchOnWindowFocus: true })

// Per-query
const { data } = useApi('listUsers', {
  refetchOnWindowFocus: true,
  refetchOnReconnect: true   // also available
})
```

### Infinite Query

**React Query:**
```typescript
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage
} = useInfiniteQuery({
  queryKey: ['posts', userId],
  queryFn: ({ pageParam }) => fetchPosts(userId, pageParam),
  initialPageParam: undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor
})

// Access pages: data.pages
```

**Zustand API Manager:**
```typescript
// Define in composer config
const useApi = createApiComposer<MyApi>({
  infiniteQueries: {
    listPosts: {
      queryFn: (params, cursor) => fetchPosts(params.userId, cursor),
      getNextCursor: (lastPage) => lastPage.nextCursor ?? null
    }
  }
})

// Use in component
const { pages, fetchNextPage, hasNextPage, isFetchingNextPage } =
  useApi('listPosts', { params: { userId } })

// Access pages directly: pages (not data.pages)
```

---

## From SWR

### Basic Hook

**SWR:**
```typescript
const { data, error, isLoading, mutate } = useSWR(
  '/api/user',
  fetcher,
  { revalidateOnFocus: true }
)
```

**Zustand API Manager:**
```typescript
const { data, error, isLoading, invalidate } = useApi('getUser', {
  params: { id: 1 },
  staleTime: 30_000,
  refetchOnWindowFocus: true  // same as SWR's revalidateOnFocus
})
```

### Mutation

**SWR:**
```typescript
await mutate('/api/user', updateUser(data), {
  optimisticData: data,
  rollbackOnError: true
})
```

**Zustand API Manager:**
```typescript
const { mutate } = useApi('updateUser')
// Optimistic updates + rollback defined at composer level
await mutate(data)
```

---

## From Redux Toolkit Query

### API Definition

**RTK Query:**
```typescript
const api = createApi({
  endpoints: (builder) => ({
    getUser: builder.query<User, number>({
      query: (id) => `/users/${id}`,
      providesTags: ['User']
    }),
    createUser: builder.mutation<User, CreatePayload>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['User']
    })
  })
})
```

**Zustand API Manager:**
```typescript
interface MyApi {
  getUser: ApiQueryEndpoint<{ id: number }, User>
  listUsers: ApiQueryEndpoint<void, User[]>
  createUser: ApiMutationEndpoint<CreatePayload, User>
}

const useApi = createApiComposer<MyApi>({
  queries: {
    getUser: (params) => fetchUser(params.id),
    listUsers: () => fetchUsers()
  },
  mutations: {
    createUser: {
      fn: (payload) => createUser(payload),
      invalidates: ['listUsers', 'getUser'] // like invalidatesTags but type-safe
    }
  }
})

// Declarative mode in component:
const { data } = useApi('getUser', { params: { id: 1 } })
```

---

## Key Differences

### Advantages

1. **Lighter Bundle**: ~10KB vs ~40KB (React Query) or ~35KB (RTK Query)
2. **Zero Extra Peer Deps**: Only `zustand` + `react` (no immer or other runtime deps)
3. **One Hook**: The composer gives you one `useApi` for your entire API
4. **Declarative Invalidation**: Define at composer level, not scattered across components
5. **Declarative Optimistic Updates**: Define at composer level with automatic rollback
6. **Built-in Polling**: Declarative `polling` option with `enabled` toggle
7. **Refetch on Focus / Reconnect**: Opt-in per query or globally
8. **Infinite Queries**: Cursor-based pagination with `fetchNextPage` / `hasNextPage`
9. **Garbage Collection**: Automatic cleanup of unmounted query caches
10. **Static Prefetch**: `useApi.prefetch()` works outside React components
11. **Zustand Integration**: Works with existing Zustand stores
12. **Store Isolation**: Easy multi-store setup for per-feature isolation
13. **Simpler API**: Fewer concepts to learn

### Considerations

1. **Manual Query Keys**: You define your own key structure
2. **Observer Mode is Explicit**: Use `useApi(key)` without options to read without fetching

---

## Migration Checklist

- [ ] Install `zustand-api-manager zustand`
- [ ] Define your API structure interface
- [ ] Create composer with `createApiComposer`
- [ ] Add `invalidates` to mutations that should trigger query refetches
- [ ] Add `optimistic` updaters where you need instant UI updates
- [ ] Replace `useQuery` with declarative composer calls
- [ ] Replace `useMutation` with composer mutation calls
- [ ] Replace `refetchInterval` with `polling` option
- [ ] Replace `refetchOnWindowFocus` with `refetchOnWindowFocus` declarative option or global default
- [ ] Replace `useInfiniteQuery` with `ApiInfiniteQueryEndpoint` + `infiniteQueries` config
- [ ] Replace `prefetchQuery` with `useApi.prefetch()`
- [ ] Remove manual `invalidateQueries` / `setQueryData` calls (now declarative)
- [ ] Set up global config if needed (including `defaultGcTime`, `defaultRefetchOnWindowFocus`)
- [ ] Test all API calls
- [ ] Remove old library dependencies (including `immer` if only used by zustand-api-manager)

---

## Best Practices for Migration

1. **Migrate Incrementally**: Start with one feature at a time
2. **Define Invalidation at Composer Level**: Don't scatter `invalidateApi` calls
3. **Use Optimistic Updates**: They're much simpler with the composer pattern
4. **Use Polling for Live Data**: Add `polling` to declarative options instead of custom intervals
5. **Prefetch on Hover**: Use `useApi.prefetch()` for instant navigation
6. **Test Thoroughly**: Especially cache behavior and error states
7. **Use DevTools**: Enable devtools during migration

---

## Need Help?

- Check the [examples](../examples)
- Read the [API reference](./api-reference.md)
- Open an issue on GitHub
