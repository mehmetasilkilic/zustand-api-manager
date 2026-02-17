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
  staleTime: 30_000
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
2. **One Hook**: The composer gives you one `useApi` for your entire API
3. **Declarative Invalidation**: Define at composer level, not scattered across components
4. **Declarative Optimistic Updates**: Define at composer level with automatic rollback
5. **Built-in Polling**: Declarative `polling` option with `enabled` toggle
6. **Static Prefetch**: `useApi.prefetch()` works outside React components
7. **Zustand Integration**: Works with existing Zustand stores
8. **Store Isolation**: Easy multi-store setup for per-feature isolation
9. **Simpler API**: Fewer concepts to learn

### Considerations

1. **No Automatic Refetch on Focus**: Use `polling` or `revalidateOnStale` instead
2. **Manual Query Keys**: You define your own key structure
3. **Observer Mode is Explicit**: Use `useApi(key)` without options to read without fetching

---

## Migration Checklist

- [ ] Install `zustand-api-manager zustand immer`
- [ ] Define your API structure interface
- [ ] Create composer with `createApiComposer`
- [ ] Add `invalidates` to mutations that should trigger query refetches
- [ ] Add `optimistic` updaters where you need instant UI updates
- [ ] Replace `useQuery` with declarative composer calls
- [ ] Replace `useMutation` with composer mutation calls
- [ ] Replace `refetchInterval` with `polling` option
- [ ] Replace `prefetchQuery` with `useApi.prefetch()`
- [ ] Remove manual `invalidateQueries` / `setQueryData` calls (now declarative)
- [ ] Set up global config if needed
- [ ] Test all API calls
- [ ] Remove old library dependencies

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
