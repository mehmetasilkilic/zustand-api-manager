# Examples

This directory contains practical examples of using `zustand-api-manager` in real-world scenarios.

## Available Examples

### 1. Basic Usage (`basic/`)
Simple example showing:
- Basic API call with `useApiHandler`
- Loading states
- Error handling
- Cache with `staleTime`
- Persistence
- Retry logic

### 2. Authentication (`authentication/`)
Login flow demonstrating:
- Using `useApiMutation` for POST requests
- Form handling
- Token storage
- Logout with `resetAll()`
- Error feedback

### 3. File Upload (`file-upload/`)
File upload with progress showing:
- File upload with `useApiMutation`
- Timeout handling
- AbortController for cancellation
- Success/error feedback
- Reset after upload

### 4. Polling (`polling/`)
Real-time notifications using:
- `usePolling` hook
- Conditional polling with `enabled` option
- Immediate fetch with `immediate` option
- Unread count badge
- Stop polling when viewing

### 5. Multiple Stores (`multiple-stores/`)
Isolated feature module with:
- `createApiStore` for isolation
- DevTools integration
- Prefetching
- Independent state management
- Feature-specific persistence

## Running Examples

Each example is a standalone React component. To use them:

1. Install dependencies:
```bash
npm install react react-dom zustand-api-manager
```

2. Import and use in your app:
```tsx
import BasicExample from './examples/basic/App'
import LoginForm from './examples/authentication/LoginForm'
// etc.

function App() {
  return (
    <div>
      <BasicExample />
      <LoginForm />
    </div>
  )
}
```

## Key Patterns Demonstrated

- **Query vs Mutation**: Use `useApiQuery` for reads (GET), `useApiMutation` for writes (POST/PUT/DELETE)
- **Caching**: Use `staleTime` to avoid redundant fetches
- **Polling**: Use `usePolling` for real-time updates
- **Prefetching**: Use `usePrefetch` for optimistic loading
- **Isolation**: Use `createApiStore` for feature modules
- **Global state**: Use singleton store for shared data
- **Cancellation**: Use AbortController for user cancellations
- **Timeout**: Set `timeout` for slow requests
- **Retry**: Use `retry` with `shouldRetry` for transient failures

## Best Practices

1. **Use stable keys**: Use consistent key names across your app
2. **Set appropriate staleTime**: Balance freshness with performance
3. **Handle errors**: Always provide onError callbacks
4. **Clean up**: Use `reset()` when appropriate
5. **Prefetch on hover**: Improve perceived performance
6. **Isolate features**: Use separate stores for independent modules
7. **Enable DevTools**: Use `enableDevtools` during development

## API Endpoints

These examples use placeholder endpoints. Replace with your actual API:
- `/api/login` - Authentication endpoint
- `/api/upload` - File upload endpoint
- `/api/notifications` - Notifications endpoint
- `/api/features/:id` - Feature data endpoint

Or use a mock API service like JSONPlaceholder for testing.
