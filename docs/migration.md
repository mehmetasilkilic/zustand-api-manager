# Migration Guide

Guide for migrating from other data fetching libraries.

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
// Declarative mode — closest to React Query's API
const { data, isLoading, error } = useApiQuery<User>('user', {
  queryFn: () => fetchUser(userId),
  staleTime: 60_000
})
```

### Mutation Hook

**React Query:**
```typescript
const mutation = useMutation({
  mutationFn: createUser,
  onSuccess: (data) => console.log(data)
})

mutation.mutate({ name: 'John' })
```

**Zustand API Manager:**
```typescript
const { mutate } = useApiMutation<User, CreatePayload>(
  'createUser',
  createUser
)

mutate({ name: 'John' }, {
  onSuccess: (data) => console.log(data)
})
```

### Cache Invalidation

**React Query:**
```typescript
queryClient.invalidateQueries({ queryKey: ['users'] })
```

**Zustand API Manager:**
```typescript
useApiStore.getState().invalidateApi('users')
// or batch:
useApiStore.getState().invalidateApis(['users', 'posts'])
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
const { data } = useApiQuery<User>('user', {
  queryFn: () => fetchUser(1)
})

// Component B: reads the same data (observer mode)
const { data } = useApiQuery<User>('user')
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
const { data, error, isLoading, invalidate } = useApiQuery<User>('user', {
  queryFn: () => api.getUser(),
  revalidateOnStale: true,
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
const { mutate } = useApiMutation('updateUser', updateUser)

await mutate(data, {
  optimisticData: data
  // automatic rollback on error
})
```

---

## From Redux Toolkit Query

### API Definition

**RTK Query:**
```typescript
const api = createApi({
  endpoints: (builder) => ({
    getUser: builder.query<User, number>({
      query: (id) => `/users/${id}`
    })
  })
})
```

**Zustand API Manager:**
```typescript
interface MyApi {
  getUser: ApiQueryEndpoint<{ id: number }, User>
}

const useApi = createApiComposer<MyApi>({
  queries: {
    getUser: (params) => fetchUser(params.id)
  }
})

// Declarative mode in component:
const { data } = useApi('getUser', { params: { id: 1 } })
```

---

## Key Differences

### Advantages

1. **Lighter Bundle**: Built on Zustand (smaller than React Query)
2. **Simpler API**: Fewer concepts to learn
3. **Zustand Integration**: Works with existing Zustand stores
4. **Better TypeScript**: Strong inference out of the box
5. **Store Isolation**: Easy multi-store setup
6. **Declarative + Imperative**: Choose the right mode per use case

### Considerations

1. **No Automatic Refetch on Focus**: Use `usePolling` or `revalidateOnStale` instead
2. **Manual Query Keys**: You define your own key structure
3. **Observer Mode is Explicit**: Use `useApiQuery(key)` without options to read without fetching

---

## Migration Checklist

- [ ] Install `zustand-api-manager zustand immer`
- [ ] Replace `useQuery` with `useApiQuery` (use declarative mode with `queryFn`)
- [ ] Replace `useMutation` with `useApiMutation`
- [ ] Update cache invalidation calls (`invalidateApi`, `invalidateApis`)
- [ ] Migrate optimistic updates
- [ ] Set up global config (if needed)
- [ ] Update error handling
- [ ] Test all API calls
- [ ] Remove old library dependencies

---

## Best Practices for Migration

1. **Migrate Incrementally**: Start with one feature at a time
2. **Keep Keys Consistent**: Use similar key naming to your old setup
3. **Prefer Declarative Mode**: Use `queryFn` for most queries to avoid `useEffect` boilerplate
4. **Use Observer Mode**: For components that only read data fetched elsewhere
5. **Test Thoroughly**: Especially cache behavior and error states
6. **Use DevTools**: Enable devtools during migration
7. **Document Changes**: Note any behavioral differences

---

## Need Help?

- Check the [examples](../examples)
- Read the [API reference](./api-reference.md)
- Open an issue on GitHub
