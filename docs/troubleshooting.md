# Troubleshooting Guide

Common issues and their solutions.

## Table of Contents

- [State Not Updating](#state-not-updating)
- [Infinite Loops](#infinite-loops)
- [Cache Issues](#cache-issues)
- [TypeScript Errors](#typescript-errors)
- [Performance Issues](#performance-issues)
- [SSR Problems](#ssr-problems)
- [React Native Issues](#react-native-issues)

---

## State Not Updating

### Component Not Re-rendering

**Problem**: Component doesn't update when API call completes.

**Solution**: Ensure you're using the hook, not just calling store methods:

```typescript
// ❌ Wrong - store method doesn't subscribe
const handleClick = () => {
  useApiStore.getState().handleApi('users', fetchUsers)
}

// ✅ Correct - use the hook with declarative mode
const { data } = useApiQuery('users', {
  queryFn: () => fetchUsers()
})

// ✅ Or use the hook imperatively
const { query } = useApiQuery('users')
const handleClick = () => query(() => fetchUsers())
```

### Data Persisted Incorrectly

**Problem**: Data not persisting or persisting when it shouldn't.

**Solution**: Check `persist` option:

```typescript
// Persist
useApiQuery('user', { queryFn: fetchUser, persist: true })

// Don't persist (default)
useApiQuery('user', { queryFn: fetchUser })
```

---

## Infinite Loops

### useEffect Infinite Loop

**Problem**: `useEffect` causes infinite requests.

**Solution**: Use declarative mode instead of `useEffect` + `query()`:

```typescript
// ✅ Best - declarative mode handles fetching automatically
const { data } = useApiQuery('user', {
  queryFn: () => fetchUser(userId),
  staleTime: 60_000
})

// ✅ Also fine - query is stable in deps
const { query } = useApiQuery('user')
useEffect(() => {
  query(() => fetchUser(userId))
}, [userId, query])

// ❌ Wrong - missing dependency
useEffect(() => {
  query(() => fetchUser(userId))
}, []) // ESLint warning
```

### Polling Creates Loop

**Problem**: Polling causes too many requests.

**Solution**: Use `enabled` option or check loading state:

```typescript
// Conditional polling
const { data } = usePolling('data', fetchData, 5000, {
  enabled: isActive // Only poll when active
})
```

---

## Cache Issues

### Stale Data Returned

**Problem**: Old data shown instead of fresh data.

**Solution**: Invalidate cache or adjust `staleTime`:

```typescript
// Invalidate after mutation
const { mutate } = useApiMutation('updateUser', updateUser)

await mutate(data, {
  onSuccess: () => {
    useApiStore.getState().invalidateApi('user')
  }
})

// Or use shorter staleTime
useApiQuery('user', { queryFn: fetchUser, staleTime: 5_000 })
```

### Cache Not Working

**Problem**: Requests not cached despite `staleTime`.

**Solution**: Ensure consistent keys and proper `fetchedAt`:

```typescript
// ✅ Consistent key
const { data } = useApiQuery<User>('user', {
  queryFn: () => fetchUser(1),
  staleTime: 60_000
})

// ❌ Different keys = different cache
useApiQuery('user-1', { queryFn: () => fetchUser(1) })
useApiQuery('user-2', { queryFn: () => fetchUser(1) }) // separate cache!
```

---

## TypeScript Errors

### Type Inference Not Working

**Problem**: `data` type is `unknown`.

**Solution**: Provide generic type parameter:

```typescript
// ✅ Correct
const { data } = useApiQuery<User>('user', {
  queryFn: () => fetchUser(1)
})

// ❌ Wrong
const { data } = useApiQuery('user', {
  queryFn: () => fetchUser(1)
}) // data is unknown
```

### ApiCallOptions Error

**Problem**: Options type mismatch.

**Solution**: Ensure callback types match data type:

```typescript
interface User { name: string }

const { data } = useApiQuery<User>('user', {
  queryFn: () => fetchUser(1),
  // ✅ Correct - data is typed as User
  onSuccess: (data) => console.log(data.name),
})
```

---

## Performance Issues

### Too Many Re-renders

**Problem**: Component renders unnecessarily.

**Solution**: Hook only subscribes to its key:

```typescript
// ✅ Only re-renders when 'user' changes
const { data } = useApiQuery('user', { queryFn: fetchUser })

// ❌ Re-renders on any state change
const allState = useApiStore(state => state.apiStates)
```

### Memory Leaks

**Problem**: Listeners not cleaned up.

**Solution**: Store returns unsubscribe functions:

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

**Solution**: Library is SSR-safe by default, but ensure:

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
useApiQuery('user', { queryFn: fetchUser, persist: true })

// ✅ Better - only persist after user action
const { query } = useApiQuery('user')
const handleSave = () => {
  query(() => saveUser(data), { persist: true })
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

### Add Logging

```typescript
configureApiStore({
  onSuccess: (data, key) => console.log(`${key}:`, data),
  onError: (error, key) => console.error(`${key}:`, error)
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
