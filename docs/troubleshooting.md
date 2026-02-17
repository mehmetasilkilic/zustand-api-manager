# Troubleshooting Guide

Common issues and their solutions.

## Table of Contents

- [State Not Updating](#state-not-updating)
- [Infinite Loops](#infinite-loops)
- [Cache Issues](#cache-issues)
- [Garbage Collection Issues](#garbage-collection-issues)
- [Infinite Query Issues](#infinite-query-issues)
- [TypeScript Errors](#typescript-errors)
- [Performance Issues](#performance-issues)
- [SSR Problems](#ssr-problems)
- [React Native Issues](#react-native-issues)

---

## State Not Updating

### Component Not Re-rendering

**Problem**: Component doesn't update when API call completes.

**Solution**: Ensure you're using the composer hook, not just calling store methods:

```typescript
// ❌ Wrong - store method doesn't subscribe
const handleClick = () => {
  useApiStore.getState().handleApi('users', fetchUsers)
}

// ✅ Correct - use declarative mode
const { data } = useApi('listUsers', {})

// ✅ Or use imperative mode
const { query } = useApi('listUsers')
const handleClick = () => query()
```

### Data Persisted Incorrectly

**Problem**: Data not persisting or persisting when it shouldn't.

**Solution**: Check `persist` option:

```typescript
// Persist
const { data } = useApi('getUser', { params: { id: 1 }, persist: true })

// Don't persist (default)
const { data } = useApi('getUser', { params: { id: 1 } })
```

---

## Infinite Loops

### useEffect Infinite Loop

**Problem**: `useEffect` causes infinite requests.

**Solution**: Use declarative mode instead of `useEffect` + `query()`:

```typescript
// ✅ Best - declarative mode handles fetching automatically
const { data } = useApi('getUser', {
  params: { id: userId },
  staleTime: 60_000
})

// ✅ Also fine - query is stable in deps
const { query } = useApi('getUser')
useEffect(() => {
  query({ id: userId })
}, [userId, query])

// ❌ Wrong - missing dependency
useEffect(() => {
  query({ id: userId })
}, []) // ESLint warning
```

### Polling Creates Loop

**Problem**: Polling causes too many requests.

**Solution**: Use `enabled` option:

```typescript
// Conditional polling — pauses when inactive
const { data } = useApi('getData', {
  polling: 5_000,
  enabled: isActive
})
```

---

## Cache Issues

### Stale Data Returned

**Problem**: Old data shown instead of fresh data.

**Solution**: Use declarative invalidation or `refetchOnWindowFocus`:

```typescript
// ✅ Best - declarative invalidation at composer level
const useApi = createApiComposer<MyApi>({
  queries: { getUser: (params) => api.getUser(params) },
  mutations: {
    updateUser: {
      fn: (payload) => api.updateUser(payload),
      invalidates: ['getUser']  // auto-invalidates on success
    }
  }
})

// ✅ Also good - refetch when user returns to tab
const { data } = useApi('getUser', {
  params: { id: 1 },
  refetchOnWindowFocus: true
})

// Or use shorter staleTime
const { data } = useApi('getUser', { params: { id: 1 }, staleTime: 5_000 })
```

### Cache Not Working

**Problem**: Requests not cached despite `staleTime`.

**Solution**: Ensure consistent params. The composer uses composite keys (`endpoint::JSON(params)`):

```typescript
// ✅ Same params = same cache key
const { data } = useApi('getUser', { params: { id: 1 }, staleTime: 60_000 })

// ❌ Different params = different cache entries
useApi('getUser', { params: { id: 1 } })  // cache key: getUser::{"id":1}
useApi('getUser', { params: { id: 2 } })  // cache key: getUser::{"id":2}
```

---

## Garbage Collection Issues

### Cache Disappears After Unmount

**Problem**: Query data is gone when navigating back to a page.

**Solution**: The default `gcTime` is 5 minutes. If you navigate back after that, the cache has been cleaned up. Increase `gcTime`:

```typescript
// Keep cache longer
const { data } = useApi('getUser', {
  params: { id: 1 },
  gcTime: 600_000  // 10 minutes
})

// Disable GC entirely
const { data } = useApi('getSettings', { gcTime: Infinity })

// Or set globally
configureApiStore({ defaultGcTime: 600_000 })
```

### Cache Not Being Cleaned Up

**Problem**: Memory grows as user navigates between many different queries.

**Solution**: Ensure you're using declarative mode (passing a second argument). GC only applies to declarative queries. Check that `gcTime` is not set to `Infinity` or `0`:

```typescript
// ✅ GC active - declarative mode
const { data } = useApi('getUser', { params: { id: 1 } })

// ❌ No GC - observer mode (no second argument)
const { data } = useApi('getUser')
```

---

## Infinite Query Issues

### Pages Not Accumulating

**Problem**: Each fetch replaces the previous page instead of appending.

**Solution**: Ensure you're using `ApiInfiniteQueryEndpoint` (not `ApiQueryEndpoint`) and the endpoint is configured in `infiniteQueries` (not `queries`):

```typescript
// ✅ Correct
interface MyApi {
  listPosts: ApiInfiniteQueryEndpoint<{ userId: number }, Post[], string>
}

const useApi = createApiComposer<MyApi>({
  infiniteQueries: {
    listPosts: {
      queryFn: (params, cursor) => api.listPosts(params.userId, cursor),
      getNextCursor: (lastPage) => lastPage.nextCursor ?? null
    }
  }
})
```

### hasNextPage Always False

**Problem**: `hasNextPage` is `false` even when more pages exist.

**Solution**: Check that `getNextCursor` returns a non-null value when there are more pages:

```typescript
// ✅ Correct - returns null when no more pages
getNextCursor: (lastPage) => lastPage.nextCursor ?? null

// ❌ Wrong - always returns undefined (falsy)
getNextCursor: (lastPage) => lastPage.nextCursor
// If nextCursor is undefined when present, hasNextPage will be false
```

### Invalidation Refetches All Pages

**Problem**: After a mutation invalidates an infinite query, all pages are lost and only the first page is refetched.

**Solution**: This is the intended behavior. When an infinite query is invalidated (e.g., by a mutation's `invalidates`), it refetches from the first page to ensure data consistency. The user can then load more pages again with `fetchNextPage()`.

---

## TypeScript Errors

### Type Inference Not Working

**Problem**: `data` type is `unknown`.

**Solution**: The composer automatically infers types from your API structure:

```typescript
// ✅ Types are inferred from the interface
interface MyApi {
  getUser: ApiQueryEndpoint<{ id: number }, User>
}

const useApi = createApiComposer<MyApi>({
  queries: { getUser: (params) => api.getUser(params) }
})

const { data } = useApi('getUser', { params: { id: 1 } })
// data is User | null ✅
```

### ApiCallOptions Error

**Problem**: Options type mismatch.

**Solution**: Ensure callback types match the endpoint's response type:

```typescript
const { data } = useApi('getUser', {
  params: { id: 1 },
  onSuccess: (data) => console.log(data.name)  // data is typed as User
})
```

---

## Performance Issues

### Too Many Re-renders

**Problem**: Component renders unnecessarily.

**Solution**: The composer hook only subscribes to its specific cache key:

```typescript
// ✅ Only re-renders when 'getUser' state changes
const { data } = useApi('getUser', { params: { id: 1 } })

// ❌ Re-renders on any state change
const allState = useApiStore(state => state.apiStates)
```

### Memory Leaks

**Problem**: Cache entries accumulate over time.

**Solution**: GC is enabled by default (5 minutes). For custom listeners, use unsubscribe functions:

```typescript
useEffect(() => {
  const unsubError = useApiStore.getState().addErrorHandler(handler)
  const unsubMiddleware = useApiStore.getState().addMiddleware(middleware)

  return () => {
    unsubError()
    unsubMiddleware()
  }
}, [])
```

---

## SSR Problems

### localStorage Error

**Problem**: `localStorage is not defined` on server.

**Solution**: Library is SSR-safe by default (including `onWindowFocus` and `onReconnect` which are no-ops on the server). For custom storage:

```typescript
// ✅ Safe - uses SSR-safe storage
const { useStore } = createApiStore()

// For custom storage, check typeof window:
const storage = typeof window !== 'undefined'
  ? window.localStorage
  : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
```

### Hydration Mismatch

**Problem**: Server and client render different content.

**Solution**: Don't persist queries that fetch on mount:

```typescript
// ❌ Can cause hydration issues
const { data } = useApi('getUser', { params: { id: 1 }, persist: true })

// ✅ Better - only persist after user action
const { query } = useApi('getUser')
const handleSave = () => {
  query({ id: 1 }, { persist: true })
}
```

---

## React Native Issues

### localStorage Not Available

**Problem**: `localStorage` doesn't exist in React Native.

**Solution**: Use custom storage:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'

const { useApiQuery } = createApiStore({
  storage: {
    getItem: (name) => AsyncStorage.getItem(name),
    setItem: (name, value) => AsyncStorage.setItem(name, value),
    removeItem: (name) => AsyncStorage.removeItem(name)
  }
})
```

---

## Common Error Messages

### "Cannot read property of undefined"

```typescript
// ❌ Accessing nested property of null
const name = data.user.name

// ✅ Use optional chaining
const name = data?.user?.name
```

### "AbortController is not defined"

Old browsers need polyfill:

```bash
npm install abortcontroller-polyfill
```

```typescript
import 'abortcontroller-polyfill/dist/abortcontroller-polyfill-only'
```

---

## Debugging Tips

### Enable DevTools

```typescript
const { useStore } = createApiStore({
  enableDevtools: true,
  devtoolsName: 'My API Store'
})
```

### Add Logging via Middleware

```typescript
const store = useApiStore.getState()
store.addMiddleware((next) => async (key, apiCall, options) => {
  console.log(`[API] ${key} started`)
  await next(key, apiCall, options)
  console.log(`[API] ${key} finished`)
})
```

### Check Network

Use browser DevTools Network tab to verify:
- Request is actually sent
- Response is successful
- Response format matches expected type

---

## Still Having Issues?

1. Check the [examples](../examples)
2. Read the [API reference](./api-reference.md)
3. Search existing [GitHub issues](https://github.com/mehmetasilkilic/zustand-api-manager/issues)
4. Open a new issue with:
   - Minimal reproduction
   - Expected behavior
   - Actual behavior
   - Environment details
