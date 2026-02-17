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

The composer hook automatically subscribes only to the specific cache key:

```typescript
// ✅ Good - only re-renders when 'getUser' state changes
function UserProfile() {
  const { data } = useApi('getUser', { params: { id: 1 } })
  return <div>{data?.name}</div>
}

// ❌ Bad - re-renders on any state change
function UserProfile() {
  const allState = useApiStore(state => state.apiStates)
  return <div>{allState['getUser']?.data?.name}</div>
}
```

### Stable Function References

The composer hook returns stable function references:

```typescript
// ✅ query, reset, invalidate, mutate are stable - safe in dependencies
const { query } = useApi('getUser')

// Declarative mode is preferred for most cases,
// but imperative is still available:
const handleRefresh = () => query({ id: 1 })
```

### Avoid Unnecessary API Calls

Use `staleTime` with declarative mode to prevent redundant fetches:

```typescript
// ✅ Good - caches for 5 minutes, auto-fetches only when stale
const { data } = useApi('getUser', {
  params: { id: 1 },
  staleTime: 300_000
})

// ❌ Bad - fetches every mount with no caching
const { data } = useApi('getUser', {
  params: { id: 1 }  // no staleTime
})
```

---

## Caching Strategy

### Choose Appropriate staleTime

Balance freshness with performance:

```typescript
// User profile - rarely changes
const { data } = useApi('getProfile', { staleTime: 600_000 })  // 10 minutes

// Notification count - changes frequently, refetch on focus
const { data } = useApi('getNotifications', {
  staleTime: 10_000,
  refetchOnWindowFocus: true
})

// Real-time data - use polling
const { data } = useApi('getLiveData', { polling: 5_000 })
```

### Use revalidateOnStale for Better UX

Return stale data immediately, refetch in background:

```typescript
const { data } = useApi('getUser', {
  params: { id: 1 },
  staleTime: 60_000,
  revalidateOnStale: true  // Show stale data instantly, update later
})
```

### Prefetch on Hover

Improve perceived performance:

```typescript
function UserList() {
  return users.map(user => (
    <li
      key={user.id}
      onMouseEnter={() => useApi.prefetch('getUser', { id: user.id })}
    >
      {user.name}
    </li>
  ))
}
```

### Cache Invalidation

Use declarative invalidation at the composer level:

```typescript
// ✅ Good - declarative invalidation defined once
const useApi = createApiComposer<MyApi>({
  queries: {
    listUsers: () => api.listUsers(),
    getUser: (params) => api.getUser(params)
  },
  mutations: {
    updateUser: {
      fn: (payload) => api.updateUser(payload),
      invalidates: ['listUsers', 'getUser']  // automatic on success
    }
  }
})

// ❌ Bad - imperative invalidation scattered across components
useApiStore.getState().invalidateAll()
```

---

## Request Optimization

### Request Deduplication

Prevent duplicate concurrent requests:

```typescript
// Multiple components share the same declarative query + dedupe
function ComponentA() {
  const { data } = useApi('getUser', {
    params: { id: 1 },
    dedupe: true
  })
}

function ComponentB() {
  const { data } = useApi('getUser', {
    params: { id: 1 },
    dedupe: true  // Shares request with A
  })
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
  const { query } = useApiQuery<SearchResult[]>('search')
  const controllerRef = useRef<AbortController>()

  const handleSearch = (term: string) => {
    // Cancel previous request
    controllerRef.current?.abort()
    controllerRef.current = new AbortController()

    query(() => searchApi(term), {
      signal: controllerRef.current.signal
    })
  }

  return <input onChange={e => handleSearch(e.target.value)} />
}
```

### Set Appropriate Timeouts

Don't wait forever for slow requests:

```typescript
const { data } = useApi('getData', {
  timeout: 10_000  // 10 second timeout
})

// Or set globally
configureApiStore({ defaultTimeout: 10_000 })
```

---

## Bundle Size

### Use Tree-Shaking

Only import what you need:

```typescript
// ✅ Good - tree-shakeable
import { useApiQuery, useApiMutation } from 'zustand-api-manager'

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

Zustand is the only peer dependency:

```json
{
  "dependencies": {
    "zustand": "^5.0.0",
    "zustand-api-manager": "^2.0.0"
  }
}
```

---

## Memory Management

### Garbage Collection (Automatic)

The composer automatically garbage-collects unmounted query caches after a configurable delay. This means you typically don't need manual cleanup:

```typescript
// GC runs automatically — cache cleaned up 5 minutes after unmount (default)
const { data } = useApi('getUser', { params: { id: 1 } })

// Customize per query
const { data } = useApi('getUser', {
  params: { id: 1 },
  gcTime: 60_000      // clean up after 1 minute
})

// Keep cache forever (disable GC)
const { data } = useApi('getSettings', { gcTime: Infinity })

// Set global default
configureApiStore({ defaultGcTime: 600_000 })  // 10 minutes
```

If a query re-mounts before GC fires, the timer is cancelled and existing cache is reused. This is the recommended approach over manual `reset()` calls.

### Manual Cleanup

For imperative use cases outside the composer, you can still reset manually:

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
const { data } = useApi('getUser', { persist: true })  // Important
const { data } = useApi('getTemp', {})  // Temporary, don't persist
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
- [ ] Use `refetchOnWindowFocus` for data that changes while user is away
- [ ] Configure `gcTime` to match your data lifecycle
- [ ] Prefetch on hover/navigation with `useApi.prefetch()`
- [ ] Set appropriate timeouts
- [ ] Use declarative `invalidates` at composer level (not imperative calls)
- [ ] Cancel unnecessary requests
- [ ] Limit persistent storage
- [ ] Monitor with DevTools
- [ ] Profile with React DevTools

---

## Real-World Example

Optimized component using the composer:

```typescript
function OptimizedUserList() {
  const { data, isLoading } = useApi('listUsers', {
    staleTime: 300_000,            // Cache 5 minutes
    revalidateOnStale: true,       // Return stale, refetch background
    dedupe: true,                  // Share with other components
    refetchOnWindowFocus: true,    // Refresh when user returns to tab
    gcTime: 600_000,               // Keep cache 10 min after unmount
    persist: true,                 // Survive reload
    timeout: 10_000                // Don't wait forever
  })

  if (isLoading) return <Loading />

  return (
    <ul>
      {data?.map(user => (
        <li
          key={user.id}
          onMouseEnter={() => useApi.prefetch('getUser', { id: user.id })}
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
