# Performance Guide

Best practices for optimal performance with zustand-api-manager.

## Table of Contents

- [Rendering Optimization](#rendering-optimization)
- [Caching Strategy](#caching-strategy)
- [Request Optimization](#request-optimization)
- [Bundle Size](#bundle-size)
- [Memory Management](#memory-management)

---

## Rendering Optimization

### Use Selective Subscriptions

The hooks automatically subscribe only to specific slices:

```typescript
// ✅ Good - only re-renders when 'user' changes
function UserProfile() {
  const { data } = useApiQuery<User>('user')
  return <div>{data?.name}</div>
}

// ❌ Bad - re-renders on any state change
function UserProfile() {
  const allState = useApiStore(state => state.apiStates)
  return <div>{allState['user']?.data?.name}</div>
}
```

### Stable Function References

All hooks return stable function references:

```typescript
// ✅ handleApi is stable - safe in dependencies
const { handleApi } = useApiQuery('user')

useEffect(() => {
  handleApi(fetchUser)
}, [handleApi]) // Won't cause infinite loop

// Same for mutate, resetApi, invalidateApi, etc.
```

### Avoid Unnecessary API Calls

Use `staleTime` to prevent redundant fetches:

```typescript
// ✅ Good - caches for 5 minutes
useEffect(() => {
  handleApi(fetchUser, { staleTime: 300_000 })
}, [handleApi])

// ❌ Bad - fetches every render
useEffect(() => {
  handleApi(fetchUser) // no staleTime
}, [handleApi])
```

---

## Caching Strategy

### Choose Appropriate staleTime

Balance freshness with performance:

```typescript
// User profile - rarely changes
handleApi(fetchProfile, { staleTime: 600_000 }) // 10 minutes

// Notification count - changes frequently
handleApi(fetchNotifications, { staleTime: 10_000 }) // 10 seconds

// Real-time data - always fresh
handleApi(fetchLiveData) // no staleTime
```

### Use revalidateOnStale for Better UX

Return stale data immediately, refetch in background:

```typescript
handleApi(fetchUser, {
  staleTime: 60_000,
  revalidateOnStale: true // Show stale data instantly, update later
})
```

### Prefetch on Hover

Improve perceived performance:

```typescript
function UserList() {
  const { prefetch } = usePrefetch()

  const handleHover = (userId: number) => {
    prefetch(`user-${userId}`, () => fetchUser(userId), {
      staleTime: 60_000
    })
  }

  return users.map(user => (
    <li onMouseEnter={() => handleHover(user.id)}>
      {user.name}
    </li>
  ))
}
```

### Cache Invalidation

Invalidate strategically:

```typescript
// ✅ Good - invalidate related data
const { mutate } = useApiMutation('updateUser', updateUser)

await mutate(data, {
  onSuccess: () => {
    // Invalidate affected queries
    useApiStore.getState().invalidateApis([
      'user',
      'user-list',
      'user-settings'
    ])
  }
})

// ❌ Bad - invalidate everything
useApiStore.getState().invalidateAll()
```

---

## Request Optimization

### Request Deduplication

Prevent duplicate concurrent requests:

```typescript
// Multiple components request same data
function ComponentA() {
  const { handleApi } = useApiQuery('user')
  useEffect(() => {
    handleApi(fetchUser, { dedupe: true })
  }, [handleApi])
}

function ComponentB() {
  const { handleApi } = useApiQuery('user')
  useEffect(() => {
    handleApi(fetchUser, { dedupe: true }) // Shares request with A
  }, [handleApi])
}
```

### Batch Operations

Use batch methods for multiple updates:

```typescript
// ✅ Good - single state update
useApiStore.getState().invalidateApis(['users', 'posts', 'comments'])

// ❌ Bad - multiple state updates
useApiStore.getState().invalidateApi('users')
useApiStore.getState().invalidateApi('posts')
useApiStore.getState().invalidateApi('comments')
```

### Abort Unnecessary Requests

Cancel requests that are no longer needed:

```typescript
function Search() {
  const controllerRef = useRef<AbortController>()

  const handleSearch = (query: string) => {
    // Cancel previous request
    controllerRef.current?.abort()
    controllerRef.current = new AbortController()

    handleApi(() => searchApi(query), {
      signal: controllerRef.current.signal
    })
  }

  return <input onChange={e => handleSearch(e.target.value)} />
}
```

### Set Appropriate Timeouts

Don't wait forever for slow requests:

```typescript
handleApi(fetchData, {
  timeout: 10_000, // 10 second timeout
  onError: (error) => {
    if (error.code === 'TIMEOUT') {
      // Handle timeout
    }
  }
})
```

---

## Bundle Size

### Use Tree-Shaking

Only import what you need:

```typescript
// ✅ Good - tree-shakeable
import { useApiHandler, useApiMutation } from 'zustand-api-manager'

// ❌ Bad - imports everything
import * as ApiManager from 'zustand-api-manager'
```

### Code Splitting

Lazy load API logic:

```typescript
// Split by feature
const UserModule = lazy(() => import('./features/user'))
const PostsModule = lazy(() => import('./features/posts'))
```

### Peer Dependencies

Zustand and Immer are peer dependencies, so you control versions:

```json
{
  "dependencies": {
    "zustand": "^5.0.0",
    "immer": "^11.0.0",
    "zustand-api-manager": "^1.1.0"
  }
}
```

---

## Memory Management

### Clean Up on Unmount

Reset state when component unmounts:

```typescript
useEffect(() => {
  return () => {
    // Clean up on unmount
    resetApi()
  }
}, [resetApi])
```

### Remove Unused Keys

Don't accumulate stale keys:

```typescript
// Clean up after feature is removed
useEffect(() => {
  return () => {
    useApiStore.getState().resetApiState('temporary-feature')
  }
}, [])
```

### Limit Persistent Storage

Only persist what's necessary:

```typescript
// ✅ Good - selective persistence
handleApi(fetchUser, { persist: true }) // Important
handleApi(fetchTemp, { persist: false }) // Temporary

// ❌ Bad - persist everything
configureApiStore({ defaultPersist: true })
```

---

## Monitoring Performance

### Use DevTools

Monitor state changes and performance:

```typescript
const { useStore } = createApiStore({
  enableDevtools: true,
  devtoolsName: 'API Store'
})
```

### Track Metrics

Add global handlers for monitoring:

```typescript
configureApiStore({
  onStart: () => performance.mark('api-start'),
  onSettled: (key) => {
    performance.mark('api-end')
    performance.measure(`api-${key}`, 'api-start', 'api-end')
  }
})
```

### Profile with React DevTools

Use React Profiler to identify unnecessary renders:

```typescript
import { Profiler } from 'react'

<Profiler id="api-component" onRender={logRenderTime}>
  <MyApiComponent />
</Profiler>
```

---

## Benchmarks

Typical performance characteristics:

| Operation | Time | Notes |
|-----------|------|-------|
| Cache hit | <1ms | Instant from memory |
| State update | 1-5ms | Zustand subscription |
| API call | 50-500ms | Network dependent |
| Persist to storage | 5-20ms | localStorage write |

---

## Performance Checklist

- [ ] Use `staleTime` for cacheable data
- [ ] Enable `dedupe` for shared requests
- [ ] Implement `revalidateOnStale` for better UX
- [ ] Prefetch on hover/navigation
- [ ] Set appropriate timeouts
- [ ] Batch invalidations
- [ ] Cancel unnecessary requests
- [ ] Clean up on unmount
- [ ] Limit persistent storage
- [ ] Monitor with DevTools
- [ ] Profile with React DevTools

---

## Real-World Example

Optimized component:

```typescript
function OptimizedUserList() {
  const { data, isLoading, handleApi } = useApiQuery<User[]>('users')
  const { prefetch } = usePrefetch()

  useEffect(() => {
    handleApi(fetchUsers, {
      staleTime: 300_000, // Cache 5 minutes
      revalidateOnStale: true, // Return stale, refetch background
      dedupe: true, // Share with other components
      persist: true, // Survive reload
      timeout: 10_000 // Don't wait forever
    })
  }, [handleApi])

  const handleHover = (userId: number) => {
    // Prefetch details on hover
    prefetch(`user-${userId}`, () => fetchUser(userId), {
      staleTime: 300_000
    })
  }

  if (isLoading && !data) return <Loading />

  return (
    <ul>
      {data?.map(user => (
        <li
          key={user.id}
          onMouseEnter={() => handleHover(user.id)}
        >
          {user.name}
        </li>
      ))}
    </ul>
  )
}
```

---

## Need More Help?

- Check the [examples](../examples)
- Read the [API reference](./api-reference.md)
- See [troubleshooting](./troubleshooting.md)
