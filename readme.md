# Zustand API Manager

[![npm version](https://img.shields.io/npm/v/zustand-api-manager.svg)](https://www.npmjs.com/package/zustand-api-manager)
[![downloads](https://img.shields.io/npm/dm/zustand-api-manager.svg)](https://www.npmjs.com/package/zustand-api-manager)
[![GitHub](https://img.shields.io/github/stars/mehmetasilkilic/zustand-api-manager?style=social)](https://github.com/mehmetasilkilic/zustand-api-manager)

A powerful and flexible API state management solution built on top of Zustand.

## Table of Contents

- [Installation](#installation)
- [Features](#features)
- [Usage](#usage)
  - [Basic Usage](#basic-usage)
  - [Global Loading](#global-loading)
  - [Advanced Usage](#advanced-usage)
- [API Reference](#api-reference)
- [Middleware and Error Handling](#middleware-and-error-handling)
- [Abort & Retry](#abort--retry)
- [TypeScript Support](#typescript-support)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
npm install zustand-api-manager
```

## Features

- Easy-to-use API state management
- Built on top of Zustand for efficient state updates
- Support for idle, loading, success, and error states
- Persistent state options
- Middleware support for customizing API call behavior
- Global error handling
- Request cancellation via `AbortSignal`
- Automatic retry with exponential back-off
- TypeScript support with strong typing

## Usage

### Basic Usage

1. Import the necessary functions:

```typescript
import { useApiHandler, FetchStatus } from "zustand-api-manager";
```

2. Use the `useApiHandler` hook in your components:

```typescript
interface UserData {
  id: number;
  username: string;
}

function MyComponent() {
  const { data, isIdle, isLoading, isError, handleApi } =
    useApiHandler<UserData>("user");

  const params = { id: 13 };

  useEffect(() => {
    handleApi(
      () => fetchUserData(params), // API call (close over your params)
      {
        onSuccess: () => {
          console.log("User data fetched successfully!");
        },
        onError: () => {
          console.error("An error occurred while fetching user data.");
        },
        persist: true
      }
    );
  }, []);

  if (isIdle) return <div>Ready to fetch</div>;
  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error occurred</div>;

  return <div>{data?.username}</div>;
}
```

### Advanced Usage

1. Create a custom API composer for your specific API structure:

```typescript
import { createApiComposer, ApiEndpoint } from "zustand-api-manager";

interface MyApiStructure {
  getUsers: ApiEndpoint<void, User[]>;
  getPost: ApiEndpoint<{ id: number }, Post>;
}

export const useApi = createApiComposer<MyApiStructure>();
```

2. Use the custom API composer in your components:

```typescript
function UserProfile() {
  const { data: userData, isLoading, handleApi } = useApi("getUsers");

  useEffect(() => {
    handleApi(() => fetchUserData({ id: 1 }));
  }, []);

  // Render component...
}
```

### Global Loading

The `useLoadingStates` hook allows you to check the loading state of one or multiple API calls:

```typescript
import { useLoadingStates } from "zustand-api-manager";

function Dashboard() {
  // Check if any API is loading
  const isAnyLoading = useLoadingStates();

  // Check if specific APIs are loading
  const isUserOrPostsLoading = useLoadingStates(["user", "posts"]);

  // Check if a single API is loading
  const isUserLoading = useLoadingStates("user");

  return (
    <div>
      {isAnyLoading && <div>Loading something...</div>}
      {isUserOrPostsLoading && <div>Loading user or posts...</div>}
      {isUserLoading && <div>Loading user data...</div>}
      {/* Rest of your component */}
    </div>
  );
}
```

## API Reference

### `useApiStore`

The main store for managing API states. Provides the following methods:

- `setApiState`: Update the state for a specific API key
- `resetApiState`: Reset the state for a specific API key
- `handleApi`: Handle an API call with automatic state management
- `addMiddleware`: Add middleware to customize API call behavior
- `addErrorHandler`: Add a global error handler

### `useApiHandler`

A hook for managing individual API calls. Returns an object with:

- `isIdle`: Boolean indicating if the API has not been called yet
- `isLoading`: Boolean indicating if the API is currently loading
- `isError`: Boolean indicating if an error occurred
- `isSuccess`: Boolean indicating if the API call was successful
- `data`: The data returned from the API call
- `error`: Any error that occurred during the API call
- `handleApi`: Function to trigger the API call
- `resetApi`: Function to reset the API state

### `useLoadingStates`

A hook to check loading states for one or more API keys:

- No arguments: returns `true` if **any** API is loading
- `string`: returns `true` if the given key is loading
- `string[]`: returns `true` if **any** of the given keys are loading

### `createApiComposer`

A function to create a strongly-typed API composer for your specific API structure.

### `FetchStatus`

An enum representing the different states of an API call:

- `IDLE`
- `LOADING`
- `SUCCESS`
- `ERROR`

### `ApiCallOptions`

Options you can pass to `handleApi`:

- `onSuccess?: () => void` — called after a successful response
- `onError?: () => void` — called after all retries are exhausted
- `persist?: boolean` — persist this key's state to localStorage
- `signal?: AbortSignal` — abort the request (from an `AbortController`)
- `retry?: number` — number of retries on failure (default `0`, exponential back-off)

## Middleware and Error Handling

You can add custom middleware and error handlers to customize the behavior of your API calls:

```typescript
const apiStore = useApiStore.getState();

// Add middleware
apiStore.addMiddleware((next) => async (key, apiCall, options) => {
  console.log(`API call started: ${key}`);
  await next(key, apiCall, options);
  console.log(`API call finished: ${key}`);
});

// Add error handler
apiStore.addErrorHandler((error, key) => {
  console.error(`Error in API call ${key}:`, error);
});
```

## Abort & Retry

### Cancelling requests

Pass an `AbortSignal` to cancel an in-flight request:

```typescript
function SearchComponent() {
  const { data, isLoading, handleApi } = useApiHandler<SearchResult[]>("search");
  const controllerRef = useRef<AbortController>();

  const onSearch = (query: string) => {
    // Cancel the previous request
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();

    handleApi(() => searchApi(query), {
      signal: controllerRef.current.signal
    });
  };

  // ...
}
```

### Retrying failed requests

Set `retry` to automatically retry on failure with exponential back-off:

```typescript
handleApi(() => fetchData(), { retry: 3 }); // up to 3 retries (4 total attempts)
```

## TypeScript Support

This package is written in TypeScript and provides strong typing out of the box. Use the `createApiComposer` function to create a strongly-typed API composer for your specific API structure.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
