# Zustand API Manager

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
- Support for loading, success, and error states
- Persistent state options
- Middleware support for customizing API call behavior
- Global error handling
- TypeScript support with strong typing

## Usage

### Basic Usage

1. Import the necessary functions:

```typescript
import { useApiStore, useApiHandler, FetchStatus } from "zustand-api-store";
```

2. Use the `useApiHandler` hook in your components:

```typescript
interface UserData {
  id: number;
  username: string;
}

interface UserParams {
  id: number;
}

function MyComponent() {
  const { data, isLoading, isError, handleApi } =
    useApiHandler<UserData, UserParams>("user");

  const params = {
    id: 13
  }

  useEffect(() => {
    handleApi(
      () => fetchUserData(params), // API call
      {
        onSuccess: () => {
          console.log("User data fetched successfully!");
          // Add any other success logic here
        },
        onError: () => {
          console.error("An error occurred while fetching user data.");
          // Handle the error or show additional UI feedback here
        },
        persist: true;
      }
    );
  }, []);

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error occurred</div>;

  return <div>{data?.name}</div>;
}
```

### Advanced Usage

1. Create a custom API composer for your specific API structure:

```typescript
import { createApiComposer, ApiEndpoint } from "zustand-api-manager";

interface MyApiStructure {
  getUsers: ApiEndpoint<void, User[]>;
  getPost: ApiEndpoint<{ id: number }, Post>;

  // You have to add this to prevent TS error
  [key: string]: ApiEndpoint<any, any>;
}

export const useApi = createApiComposer<MyApiStructure>();
```

2. Use the custom API composer in your components:

```typescript
function UserProfile() {
  const { data: userData, isLoading, handleApi } = useApi("user");

  useEffect(() => {
    handleApi(() => fetchUserData({ id: 1 }));
  }, []);

  // Render component...
}
```

### Global Loading

The `useLoadingStates` hook allows you to check the loading state of one or multiple API calls:

```typescript
import { getLoadingStates } from "zustand-api-store";

function Dashboard() {
  // Check if any API is loading
  const isAnyLoading = getLoadingStates();

  // Check if specific APIs are loading
  const isUserOrPostsLoading = getLoadingStates(["user", "posts"]);

  // Check if a single API is loading
  const isUserLoading = getLoadingStates("user");

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
- `getLoadingStates`: Check loading states for one or more API keys
- `addMiddleware`: Add middleware to customize API call behavior
- `addErrorHandler`: Add a global error handler

### `useApiHandler`

A hook for managing individual API calls. Returns an object with:

- `isLoading`: Boolean indicating if the API is currently loading
- `isError`: Boolean indicating if an error occurred
- `isSuccess`: Boolean indicating if the API call was successful
- `data`: The data returned from the API call
- `error`: Any error that occurred during the API call
- `handleApi`: Function to trigger the API call
- `resetApi`: Function to reset the API state

### `createApiComposer`

A function to create a strongly-typed API composer for your specific API structure.

### `FetchStatus`

An enum representing the different states of an API call:

- `IDLE`
- `LOADING`
- `SUCCESS`
- `ERROR`

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

## TypeScript Support

This package is written in TypeScript and provides strong typing out of the box. Use the `createApiComposer` function to create a strongly-typed API composer for your specific API structure.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
