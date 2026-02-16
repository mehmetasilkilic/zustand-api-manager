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
const { data, isLoading, error, query } = useApiQuery<User>(`user-${userId}`)

useEffect(() => {
  query(() => fetchUser(userId), { staleTime: 60_000 })
}, [userId, query])
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
useApiStore.getState().invalidate()('users')
// or batch:
useApiStore.getState().invalidate()s(['users', 'posts'])
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
const { data, error, isLoading, query, invalidate() } = useApiQuery<User>('user')

useEffect(() => {
  query(() => api.getUser(), {
    revalidateOnStale: true,
    staleTime: 30_000
  })
}, [query])
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

// In component:
const { data, query } = useApi('getUser')
query({ id: 1 })
```

---

## Key Differences

### Advantages

1. **Lighter Bundle**: Built on Zustand (smaller than React Query)
2. **Simpler API**: Fewer concepts to learn
3. **Zustand Integration**: Works with existing Zustand stores
4. **Better TypeScript**: Strong inference out of the box
5. **Store Isolation**: Easy multi-store setup

### Considerations

1. **No Automatic Refetch**: No automatic background refetching (use `usePolling` or `revalidateOnStale`)
2. **Manual Query Keys**: You define your own key structure
3. **No Query Observers**: No automatic query watching (by design)

---

## Migration Checklist

- [ ] Install `zustand-api-manager zustand immer`
- [ ] Replace `useQuery` with `useApiQuery`
- [ ] Replace `useMutation` with `useApiMutation`
- [ ] Update cache invalidation calls
- [ ] Add `useEffect` for queries (if needed)
- [ ] Migrate optimistic updates
- [ ] Set up global config (if needed)
- [ ] Update error handling
- [ ] Test all API calls
- [ ] Remove old library dependencies

---

## Best Practices for Migration

1. **Migrate Incrementally**: Start with one feature at a time
2. **Keep Keys Consistent**: Use similar key naming to your old setup
3. **Test Thoroughly**: Especially cache behavior and error states
4. **Use DevTools**: Enable devtools during migration
5. **Document Changes**: Note any behavioral differences

---

## Need Help?

- Check the [examples](../examples)
- Read the [API reference](./api-reference.md)
- Open an issue on GitHub
