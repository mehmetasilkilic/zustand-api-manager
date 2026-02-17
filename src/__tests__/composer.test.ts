import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApiStore } from '../store'
import { createApiComposer } from '../composer'
import { ApiQueryEndpoint, ApiMutationEndpoint } from '../types'

beforeEach(() => {
  useApiStore.setState({
    apiStates: {},
    persistentKeys: {},
    middleware: [],
    errorHandlers: []
  })
})

// ====================
// New Query and Mutation Endpoint Types
// ====================

interface User {
  id: number
  name: string
  email: string
}

interface CreateUserPayload {
  name: string
  email: string
}

interface ModernApi {
  getUser: ApiQueryEndpoint<{ id: number }, User>
  listUsers: ApiQueryEndpoint<void, User[]>
  createUser: ApiMutationEndpoint<CreateUserPayload, User>
  deleteUser: ApiMutationEndpoint<{ id: number }, void>
}

const mockApi = {
  getUser: vi.fn((params: { id: number }) =>
    Promise.resolve({ id: params.id, name: 'John Doe', email: 'john@example.com' })
  ),
  listUsers: vi.fn(() =>
    Promise.resolve([
      { id: 1, name: 'John', email: 'john@example.com' },
      { id: 2, name: 'Jane', email: 'jane@example.com' }
    ])
  ),
  createUser: vi.fn((payload: CreateUserPayload) =>
    Promise.resolve({ id: 3, ...payload })
  ),
  deleteUser: vi.fn(() => Promise.resolve(undefined))
}

describe('createApiComposer — Query Endpoints (ApiQueryEndpoint)', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('query endpoint returns query, reset, and invalidate', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser,
        listUsers: mockApi.listUsers
      },
      mutations: {
        createUser: mockApi.createUser
      }
    })
    const { result } = renderHook(() => useModernApi('getUser'))

    expect(result.current.query).toBeDefined()
    expect(result.current.reset).toBeDefined()
    expect(result.current.invalidate).toBeDefined()
    expect(result.current.fetchedAt).toBeDefined()
    expect((result.current as any).mutate).toBeUndefined()
  })

  it('query endpoint with params works correctly (bound)', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser,
        listUsers: mockApi.listUsers
      },
      mutations: {
        createUser: mockApi.createUser
      }
    })
    const { result } = renderHook(() => useModernApi('getUser'))

    await act(async () => {
      await result.current.query({ id: 1 })
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual({
      id: 1,
      name: 'John Doe',
      email: 'john@example.com'
    })
    expect(mockApi.getUser).toHaveBeenCalledWith({ id: 1 })
  })

  it('query endpoint without params works correctly (bound)', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser,
        listUsers: mockApi.listUsers
      },
      mutations: {
        createUser: mockApi.createUser
      }
    })
    const { result } = renderHook(() => useModernApi('listUsers'))

    await act(async () => {
      await result.current.query()
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0].name).toBe('John')
  })
})

describe('createApiComposer — Mutation Endpoints (ApiMutationEndpoint)', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('mutation endpoint returns mutate and reset', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      mutations: {
        createUser: mockApi.createUser
      }
    })
    const { result } = renderHook(() => useModernApi('createUser'))

    expect(result.current.mutate).toBeDefined()
    expect(result.current.reset).toBeDefined()
    expect((result.current as any).handleApi).toBeUndefined()
    expect((result.current as any).resetApi).toBeUndefined()
    expect((result.current as any).invalidateApi).toBeUndefined()
    expect((result.current as any).fetchedAt).toBeUndefined()
  })

  it('mutation with variables works correctly', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      mutations: {
        createUser: mockApi.createUser
      }
    })
    const { result } = renderHook(() => useModernApi('createUser'))

    expect(result.current.isIdle).toBe(true)

    await act(async () => {
      await result.current.mutate({
        name: 'Alice',
        email: 'alice@example.com'
      })
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual({
      id: 3,
      name: 'Alice',
      email: 'alice@example.com'
    })
    expect(mockApi.createUser).toHaveBeenCalledWith({
      name: 'Alice',
      email: 'alice@example.com'
    })
  })

  it('mutation with options (onSuccess, onError) works correctly', async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const useModernApi = createApiComposer<ModernApi>({
      mutations: {
        createUser: mockApi.createUser
      }
    })
    const { result } = renderHook(() => useModernApi('createUser'))

    await act(async () => {
      await result.current.mutate(
        {
          name: 'Bob',
          email: 'bob@example.com'
        },
        {
          onSuccess,
          onError
        }
      )
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(onSuccess).toHaveBeenCalledWith({
      id: 3,
      name: 'Bob',
      email: 'bob@example.com'
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('mutation reset clears state', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      mutations: {
        createUser: mockApi.createUser
      }
    })
    const { result } = renderHook(() => useModernApi('createUser'))

    await act(async () => {
      await result.current.mutate({
        name: 'Charlie',
        email: 'charlie@example.com'
      })
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.isIdle).toBe(true)
    expect(result.current.data).toBeNull()
  })
})

describe('createApiComposer — Mixed Queries and Mutations', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('supports both query and mutation endpoints in the same API', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser,
        listUsers: mockApi.listUsers
      },
      mutations: {
        createUser: mockApi.createUser,
        deleteUser: mockApi.deleteUser
      }
    })

    // Test query (bound)
    const { result: queryResult } = renderHook(() => useModernApi('getUser'))
    await act(async () => {
      await queryResult.current.query({ id: 1 })
    })

    await waitFor(() => {
      expect(queryResult.current.isSuccess).toBe(true)
    })

    expect(queryResult.current.data?.id).toBe(1)

    // Test mutation
    const { result: mutationResult } = renderHook(() => useModernApi('createUser'))
    await act(async () => {
      await mutationResult.current.mutate({
        name: 'New User',
        email: 'new@example.com'
      })
    })

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true)
    })

    expect(mutationResult.current.data?.name).toBe('New User')
  })
})

describe('createApiComposer — robustness', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('mutation variables with onSuccess property are not misinterpreted as options', async () => {
    interface SpecialApi {
      updateSettings: ApiMutationEndpoint<{ onSuccess: boolean; value: number }, { ok: boolean }>
    }

    const mockUpdate = vi.fn((_vars: { onSuccess: boolean; value: number }) =>
      Promise.resolve({ ok: true })
    )

    const useSpecialApi = createApiComposer<SpecialApi>({
      mutations: {
        updateSettings: mockUpdate
      }
    })

    const { result } = renderHook(() => useSpecialApi('updateSettings'))

    await act(async () => {
      await result.current.mutate({ onSuccess: true, value: 42 })
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // The variables should have been passed correctly, not interpreted as options
    expect(mockUpdate).toHaveBeenCalledWith({ onSuccess: true, value: 42 })
  })

  it('query endpoint has no mutate, mutation endpoint has no query/invalidate', () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser
      },
      mutations: {
        createUser: mockApi.createUser
      }
    })

    // Query endpoint
    const { result: queryResult } = renderHook(() => useModernApi('getUser'))
    expect(queryResult.current.query).toBeDefined()
    expect(queryResult.current.invalidate).toBeDefined()
    expect(queryResult.current.fetchedAt).toBeNull()
    expect((queryResult.current as any).mutate).toBeUndefined()

    // Mutation endpoint
    const { result: mutationResult } = renderHook(() => useModernApi('createUser'))
    expect(mutationResult.current.mutate).toBeDefined()
    expect((mutationResult.current as any).query).toBeUndefined()
    expect((mutationResult.current as any).invalidate).toBeUndefined()
    expect((mutationResult.current as any).fetchedAt).toBeUndefined()
  })
})

// ====================
// Declarative auto-fetch mode tests
// ====================

describe('createApiComposer — declarative mode', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('auto-fetches with bound query when params provided', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser,
        listUsers: mockApi.listUsers
      }
    })

    const { result } = renderHook(() =>
      useModernApi('getUser', { params: { id: 5 } })
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(mockApi.getUser).toHaveBeenCalledWith({ id: 5 })
    expect(result.current.data).toEqual({
      id: 5,
      name: 'John Doe',
      email: 'john@example.com'
    })
  })

  it('auto-fetches void-param endpoint with empty options', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        listUsers: mockApi.listUsers
      }
    })

    const { result } = renderHook(() =>
      useModernApi('listUsers', {})
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(mockApi.listUsers).toHaveBeenCalledTimes(1)
    expect(result.current.data).toHaveLength(2)
  })

  it('observer mode when no second arg', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser
      }
    })

    const { result } = renderHook(() => useModernApi('getUser'))

    // Should stay idle — no auto-fetch
    expect(result.current.isIdle).toBe(true)
    expect(result.current.data).toBeNull()
    expect(mockApi.getUser).not.toHaveBeenCalled()
  })

  it('refetches when params change', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser
      }
    })

    const { result, rerender } = renderHook(
      ({ id }: { id: number }) =>
        useModernApi('getUser', { params: { id } }),
      { initialProps: { id: 1 } }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(mockApi.getUser).toHaveBeenCalledWith({ id: 1 })

    rerender({ id: 2 })

    await waitFor(() => {
      expect(mockApi.getUser).toHaveBeenCalledWith({ id: 2 })
    })
    expect(mockApi.getUser).toHaveBeenCalledTimes(2)
  })

  it('does NOT refetch when params are deeply equal', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser
      }
    })

    const { rerender } = renderHook(
      ({ id }: { id: number }) =>
        useModernApi('getUser', { params: { id } }),
      { initialProps: { id: 1 } }
    )

    await waitFor(() => {
      expect(mockApi.getUser).toHaveBeenCalledTimes(1)
    })

    // Rerender with same id value (new object reference, same serialized value)
    rerender({ id: 1 })

    // Should NOT have triggered a second fetch
    expect(mockApi.getUser).toHaveBeenCalledTimes(1)
  })

  it('respects enabled: false', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser
      }
    })

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useModernApi('getUser', { params: { id: 1 }, enabled }),
      { initialProps: { enabled: false } }
    )

    expect(result.current.isIdle).toBe(true)
    expect(mockApi.getUser).not.toHaveBeenCalled()

    // Enable
    rerender({ enabled: true })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(mockApi.getUser).toHaveBeenCalledTimes(1)
  })

  it('imperative query() still works alongside declarative', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser
      }
    })

    const { result } = renderHook(() =>
      useModernApi('getUser', { params: { id: 1 } })
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // Now call imperatively with different params
    await act(async () => {
      await result.current.query({ id: 99 })
    })

    expect(mockApi.getUser).toHaveBeenCalledWith({ id: 99 })
  })

  it('mutations ignore second arg (no auto-fetch)', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      mutations: {
        createUser: mockApi.createUser
      }
    })

    // Even if somehow a second arg is passed at runtime, mutations should not auto-fetch
    const { result } = renderHook(() =>
      (useModernApi as any)('createUser', { name: 'test', email: 'test@test.com' })
    )

    expect(result.current.isIdle).toBe(true)
    expect(mockApi.createUser).not.toHaveBeenCalled()
  })
})

// ====================
// Automatic Cache Invalidation
// ====================

describe('createApiComposer — automatic invalidation', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('mutation success triggers invalidation + refetch of active declarative queries', async () => {
    const listUsersCall = vi.fn(() =>
      Promise.resolve([
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' }
      ])
    )

    const createUserCall = vi.fn((payload: CreateUserPayload) =>
      Promise.resolve({ id: 3, ...payload })
    )

    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        listUsers: listUsersCall
      },
      mutations: {
        createUser: {
          fn: createUserCall,
          invalidates: ['listUsers']
        }
      }
    })

    // Mount a declarative query for listUsers
    const { result: listResult } = renderHook(() => useModernApi('listUsers', {}))

    await waitFor(() => {
      expect(listResult.current.isSuccess).toBe(true)
    })
    expect(listUsersCall).toHaveBeenCalledTimes(1)

    // Mount a mutation for createUser
    const { result: mutationResult } = renderHook(() => useModernApi('createUser'))

    // Perform mutation
    await act(async () => {
      await mutationResult.current.mutate({ name: 'Alice', email: 'alice@example.com' })
    })

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true)
    })

    // listUsers should have been refetched (invalidation + active query refetch)
    await waitFor(() => {
      expect(listUsersCall).toHaveBeenCalledTimes(2)
    })
  })

  it('invalidation does NOT happen on mutation error', async () => {
    const listUsersCall = vi.fn(() =>
      Promise.resolve([{ id: 1, name: 'John', email: 'john@example.com' }])
    )

    const failingMutation = vi.fn(() => Promise.reject(new Error('Server error')))

    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        listUsers: listUsersCall
      },
      mutations: {
        createUser: {
          fn: failingMutation,
          invalidates: ['listUsers']
        }
      }
    })

    // Mount declarative query
    const { result: listResult } = renderHook(() => useModernApi('listUsers', {}))

    await waitFor(() => {
      expect(listResult.current.isSuccess).toBe(true)
    })
    expect(listUsersCall).toHaveBeenCalledTimes(1)

    // Attempt mutation (will fail)
    const { result: mutationResult } = renderHook(() => useModernApi('createUser'))

    await act(async () => {
      await mutationResult.current.mutate({ name: 'Alice', email: 'alice@example.com' })
    })

    await waitFor(() => {
      expect(mutationResult.current.isError).toBe(true)
    })

    // listUsers should NOT have been refetched
    expect(listUsersCall).toHaveBeenCalledTimes(1)
  })

  it('multiple invalidated keys all refetch', async () => {
    const listUsersCall = vi.fn(() =>
      Promise.resolve([{ id: 1, name: 'John', email: 'john@example.com' }])
    )

    const getUserCall = vi.fn((params: { id: number }) =>
      Promise.resolve({ id: params.id, name: 'John', email: 'john@example.com' })
    )

    const createUserCall = vi.fn((payload: CreateUserPayload) =>
      Promise.resolve({ id: 3, ...payload })
    )

    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        listUsers: listUsersCall,
        getUser: getUserCall
      },
      mutations: {
        createUser: {
          fn: createUserCall,
          invalidates: ['listUsers', 'getUser']
        }
      }
    })

    // Mount both declarative queries
    const { result: listResult } = renderHook(() => useModernApi('listUsers', {}))
    const { result: userResult } = renderHook(() =>
      useModernApi('getUser', { params: { id: 1 } })
    )

    await waitFor(() => {
      expect(listResult.current.isSuccess).toBe(true)
      expect(userResult.current.isSuccess).toBe(true)
    })

    expect(listUsersCall).toHaveBeenCalledTimes(1)
    expect(getUserCall).toHaveBeenCalledTimes(1)

    // Perform mutation
    const { result: mutationResult } = renderHook(() => useModernApi('createUser'))

    await act(async () => {
      await mutationResult.current.mutate({ name: 'Alice', email: 'alice@example.com' })
    })

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true)
    })

    // Both queries should have been refetched
    await waitFor(() => {
      expect(listUsersCall).toHaveBeenCalledTimes(2)
      expect(getUserCall).toHaveBeenCalledTimes(2)
    })
  })

  it('non-active (unmounted) queries are invalidated but not refetched', async () => {
    const listUsersCall = vi.fn(() =>
      Promise.resolve([{ id: 1, name: 'John', email: 'john@example.com' }])
    )

    const createUserCall = vi.fn((payload: CreateUserPayload) =>
      Promise.resolve({ id: 3, ...payload })
    )

    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        listUsers: listUsersCall
      },
      mutations: {
        createUser: {
          fn: createUserCall,
          invalidates: ['listUsers']
        }
      }
    })

    // Mount declarative query, then unmount it
    const { result: listResult, unmount } = renderHook(() => useModernApi('listUsers', {}))

    await waitFor(() => {
      expect(listResult.current.isSuccess).toBe(true)
    })
    expect(listUsersCall).toHaveBeenCalledTimes(1)

    // Unmount the query — removes it from active queries
    unmount()

    // Perform mutation
    const { result: mutationResult } = renderHook(() => useModernApi('createUser'))

    await act(async () => {
      await mutationResult.current.mutate({ name: 'Alice', email: 'alice@example.com' })
    })

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true)
    })

    // The cache is invalidated (fetchedAt cleared) but no refetch since query is unmounted
    expect(listUsersCall).toHaveBeenCalledTimes(1)
    const state = useApiStore.getState().apiStates['listUsers']
    expect(state?.fetchedAt).toBeNull()
  })

  it('bare function config still works (backward compat)', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      mutations: {
        createUser: mockApi.createUser
      }
    })

    const { result } = renderHook(() => useModernApi('createUser'))

    await act(async () => {
      await result.current.mutate({ name: 'Alice', email: 'alice@example.com' })
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual({ id: 3, name: 'Alice', email: 'alice@example.com' })
    expect(mockApi.createUser).toHaveBeenCalledWith({ name: 'Alice', email: 'alice@example.com' })
  })
})

// ====================
// Cross-Endpoint Optimistic Updates
// ====================

describe('createApiComposer — cross-endpoint optimistic updates', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('optimistic data appears immediately in target query cache', async () => {
    let resolveCreate: (value: User) => void
    const createUserCall = vi.fn(
      (_payload: CreateUserPayload) => new Promise<User>(resolve => { resolveCreate = resolve })
    )

    const listUsersCall = vi.fn(() =>
      Promise.resolve([{ id: 1, name: 'John', email: 'john@example.com' }])
    )

    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        listUsers: listUsersCall
      },
      mutations: {
        createUser: {
          fn: createUserCall,
          invalidates: ['listUsers'],
          optimistic: {
            listUsers: (variables, currentData) => [
              ...(currentData ?? []),
              { id: 999, ...variables }
            ]
          }
        }
      }
    })

    // Mount and populate listUsers
    const { result: listResult } = renderHook(() => useModernApi('listUsers', {}))

    await waitFor(() => {
      expect(listResult.current.isSuccess).toBe(true)
    })

    expect(listResult.current.data).toHaveLength(1)

    // Mount mutation and trigger it (won't resolve yet)
    const { result: mutationResult } = renderHook(() => useModernApi('createUser'))

    act(() => {
      mutationResult.current.mutate({ name: 'Alice', email: 'alice@example.com' })
    })

    // Optimistic data should appear immediately
    await waitFor(() => {
      expect(listResult.current.data).toHaveLength(2)
    })
    expect(listResult.current.data?.[1]).toEqual({
      id: 999,
      name: 'Alice',
      email: 'alice@example.com'
    })

    // Resolve the mutation
    await act(async () => {
      resolveCreate!({ id: 3, name: 'Alice', email: 'alice@example.com' })
    })

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true)
    })
  })

  it('rollback on mutation error restores previous data', async () => {
    const listUsersCall = vi.fn(() =>
      Promise.resolve([{ id: 1, name: 'John', email: 'john@example.com' }])
    )

    const failingCreate = vi.fn(() => Promise.reject(new Error('Server error')))

    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        listUsers: listUsersCall
      },
      mutations: {
        createUser: {
          fn: failingCreate,
          invalidates: ['listUsers'],
          optimistic: {
            listUsers: (variables, currentData) => [
              ...(currentData ?? []),
              { id: 999, ...variables }
            ]
          }
        }
      }
    })

    // Mount and populate listUsers
    const { result: listResult } = renderHook(() => useModernApi('listUsers', {}))

    await waitFor(() => {
      expect(listResult.current.isSuccess).toBe(true)
    })

    expect(listResult.current.data).toHaveLength(1)

    // Perform failing mutation
    const { result: mutationResult } = renderHook(() => useModernApi('createUser'))

    await act(async () => {
      await mutationResult.current.mutate({ name: 'Alice', email: 'alice@example.com' })
    })

    await waitFor(() => {
      expect(mutationResult.current.isError).toBe(true)
    })

    // Data should be rolled back to original
    await waitFor(() => {
      expect(listResult.current.data).toHaveLength(1)
    })
    expect(listResult.current.data?.[0]).toEqual({
      id: 1,
      name: 'John',
      email: 'john@example.com'
    })
  })

  it('on success, invalidation refetch replaces optimistic data with real data', async () => {
    let callCount = 0
    const listUsersCall = vi.fn(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve([{ id: 1, name: 'John', email: 'john@example.com' }])
      }
      // After invalidation, return the server-truth including the new user
      return Promise.resolve([
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 3, name: 'Alice', email: 'alice@example.com' }
      ])
    })

    const createUserCall = vi.fn((payload: CreateUserPayload) =>
      Promise.resolve({ id: 3, ...payload })
    )

    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        listUsers: listUsersCall
      },
      mutations: {
        createUser: {
          fn: createUserCall,
          invalidates: ['listUsers'],
          optimistic: {
            listUsers: (variables, currentData) => [
              ...(currentData ?? []),
              { id: 999, ...variables } // optimistic ID
            ]
          }
        }
      }
    })

    // Mount and populate listUsers
    const { result: listResult } = renderHook(() => useModernApi('listUsers', {}))

    await waitFor(() => {
      expect(listResult.current.isSuccess).toBe(true)
    })

    // Perform mutation
    const { result: mutationResult } = renderHook(() => useModernApi('createUser'))

    await act(async () => {
      await mutationResult.current.mutate({ name: 'Alice', email: 'alice@example.com' })
    })

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true)
    })

    // After invalidation refetch, the data should reflect server truth (id: 3, not 999)
    await waitFor(() => {
      expect(listUsersCall).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(listResult.current.data).toHaveLength(2)
      expect(listResult.current.data?.[1]?.id).toBe(3)
    })
  })
})

// ====================
// Polling
// ====================

describe('createApiComposer — polling', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('polls at the given interval', async () => {
    vi.useFakeTimers()

    const listUsersCall = vi.fn(() =>
      Promise.resolve([{ id: 1, name: 'John', email: 'john@example.com' }])
    )

    const useModernApi = createApiComposer<ModernApi>({
      queries: { listUsers: listUsersCall }
    })

    const { unmount } = renderHook(() =>
      useModernApi('listUsers', { polling: 1000 })
    )

    // Initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(listUsersCall).toHaveBeenCalledTimes(1)

    // First poll tick
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(listUsersCall).toHaveBeenCalledTimes(2)

    // Second poll tick
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(listUsersCall).toHaveBeenCalledTimes(3)

    unmount()
    vi.useRealTimers()
  })

  it('stops polling on unmount', async () => {
    vi.useFakeTimers()

    const listUsersCall = vi.fn(() =>
      Promise.resolve([{ id: 1, name: 'John', email: 'john@example.com' }])
    )

    const useModernApi = createApiComposer<ModernApi>({
      queries: { listUsers: listUsersCall }
    })

    const { unmount } = renderHook(() =>
      useModernApi('listUsers', { polling: 1000 })
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(listUsersCall).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(listUsersCall).toHaveBeenCalledTimes(2)

    unmount()

    await vi.advanceTimersByTimeAsync(5000)
    // Should not have called again after unmount
    expect(listUsersCall).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('skips poll tick if previous request is still loading', async () => {
    vi.useFakeTimers()

    let resolveCall: (() => void) | undefined
    let callCount = 0
    const slowListUsers = vi.fn(() => {
      callCount++
      if (callCount === 2) {
        // Second call is slow — takes longer than the poll interval
        return new Promise<User[]>(resolve => {
          resolveCall = () => resolve(
            [{ id: 1, name: 'John', email: 'john@example.com' }]
          )
        })
      }
      return Promise.resolve(
        [{ id: 1, name: 'John', email: 'john@example.com' }]
      )
    })

    const useModernApi = createApiComposer<ModernApi>({
      queries: { listUsers: slowListUsers }
    })

    const { unmount } = renderHook(() =>
      useModernApi('listUsers', { polling: 500 })
    )

    // Initial fetch resolves immediately
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(slowListUsers).toHaveBeenCalledTimes(1)

    // First poll — starts slow request
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(slowListUsers).toHaveBeenCalledTimes(2)

    // Second poll — should skip because status is LOADING
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(slowListUsers).toHaveBeenCalledTimes(2) // still 2, skipped

    // Resolve the slow call
    await act(async () => {
      resolveCall?.()
      await vi.advanceTimersByTimeAsync(0)
    })

    // Next poll should fire now
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(slowListUsers).toHaveBeenCalledTimes(3)

    unmount()
    vi.useRealTimers()
  })

  it('pauses polling when enabled is false', async () => {
    vi.useFakeTimers()

    const listUsersCall = vi.fn(() =>
      Promise.resolve([{ id: 1, name: 'John', email: 'john@example.com' }])
    )

    const useModernApi = createApiComposer<ModernApi>({
      queries: { listUsers: listUsersCall }
    })

    const { unmount, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useModernApi('listUsers', { polling: 500, enabled }),
      { initialProps: { enabled: false } }
    )

    await vi.advanceTimersByTimeAsync(2000)
    expect(listUsersCall).not.toHaveBeenCalled()

    // Enable
    rerender({ enabled: true })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(listUsersCall).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(listUsersCall).toHaveBeenCalledTimes(2)

    unmount()
    vi.useRealTimers()
  })
})

// ====================
// Prefetch
// ====================

describe('createApiComposer — prefetch', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('prefetch populates the cache', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser,
        listUsers: mockApi.listUsers
      }
    })

    await useModernApi.prefetch('getUser', { id: 1 })

    const state = useApiStore.getState().apiStates['getUser::{"id":1}']
    expect(state?.data).toEqual({
      id: 1,
      name: 'John Doe',
      email: 'john@example.com'
    })
    expect(mockApi.getUser).toHaveBeenCalledWith({ id: 1 })
  })

  it('prefetch for void-param endpoint works', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        listUsers: mockApi.listUsers
      }
    })

    await useModernApi.prefetch('listUsers')

    const state = useApiStore.getState().apiStates['listUsers']
    expect(state?.data).toHaveLength(2)
    expect(mockApi.listUsers).toHaveBeenCalledTimes(1)
  })

  it('prefetch does not call onSuccess/onError callbacks', async () => {
    const onSuccess = vi.fn()
    const onError = vi.fn()

    const useModernApi = createApiComposer<ModernApi>({
      queries: {
        getUser: mockApi.getUser
      }
    })

    await useModernApi.prefetch('getUser', { id: 1 }, {
      staleTime: 60_000,
      onSuccess: onSuccess as any,
      onError: onError as any
    } as any)

    const state = useApiStore.getState().apiStates['getUser::{"id":1}']
    expect(state?.data).toBeDefined()
    // Even if someone passes callbacks, they get stripped
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})

// ====================
// Parameterized Cache Isolation
// ====================

describe('createApiComposer — parameterized cache isolation', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('different params produce different cache entries', async () => {
    const getUserCall = vi.fn((params: { id: number }) =>
      Promise.resolve({ id: params.id, name: `User ${params.id}`, email: `user${params.id}@test.com` })
    )

    const useModernApi = createApiComposer<ModernApi>({
      queries: { getUser: getUserCall }
    })

    // Mount two hooks with different params
    const { result: result1 } = renderHook(() =>
      useModernApi('getUser', { params: { id: 1 } })
    )
    const { result: result2 } = renderHook(() =>
      useModernApi('getUser', { params: { id: 2 } })
    )

    await waitFor(() => {
      expect(result1.current.isSuccess).toBe(true)
      expect(result2.current.isSuccess).toBe(true)
    })

    // Data should be isolated
    expect(result1.current.data).toEqual({ id: 1, name: 'User 1', email: 'user1@test.com' })
    expect(result2.current.data).toEqual({ id: 2, name: 'User 2', email: 'user2@test.com' })

    // Both should have been called
    expect(getUserCall).toHaveBeenCalledTimes(2)

    // Store should have two different keys
    const states = useApiStore.getState().apiStates
    expect(states['getUser::{"id":1}']).toBeDefined()
    expect(states['getUser::{"id":2}']).toBeDefined()
    expect(states['getUser::{"id":1}']?.data).toEqual({ id: 1, name: 'User 1', email: 'user1@test.com' })
    expect(states['getUser::{"id":2}']?.data).toEqual({ id: 2, name: 'User 2', email: 'user2@test.com' })
  })

  it('void-param queries use bare key', async () => {
    const useModernApi = createApiComposer<ModernApi>({
      queries: { listUsers: mockApi.listUsers }
    })

    const { result } = renderHook(() => useModernApi('listUsers', {}))

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // Should use bare key (no params = no :: suffix)
    const states = useApiStore.getState().apiStates
    expect(states['listUsers']).toBeDefined()
    expect(states['listUsers']?.data).toHaveLength(2)
  })

  it('invalidation broadcasts to all composite keys', async () => {
    const getUserCall = vi.fn((params: { id: number }) =>
      Promise.resolve({ id: params.id, name: `User ${params.id}`, email: `user${params.id}@test.com` })
    )

    const createUserCall = vi.fn((payload: CreateUserPayload) =>
      Promise.resolve({ id: 3, ...payload })
    )

    const useModernApi = createApiComposer<ModernApi>({
      queries: { getUser: getUserCall },
      mutations: {
        createUser: {
          fn: createUserCall,
          invalidates: ['getUser']
        }
      }
    })

    // Mount two queries with different params
    const { result: result1 } = renderHook(() =>
      useModernApi('getUser', { params: { id: 1 } })
    )
    const { result: result2 } = renderHook(() =>
      useModernApi('getUser', { params: { id: 2 } })
    )

    await waitFor(() => {
      expect(result1.current.isSuccess).toBe(true)
      expect(result2.current.isSuccess).toBe(true)
    })

    expect(getUserCall).toHaveBeenCalledTimes(2)

    // Perform mutation that invalidates getUser
    const { result: mutResult } = renderHook(() => useModernApi('createUser'))

    await act(async () => {
      await mutResult.current.mutate({ name: 'Alice', email: 'alice@test.com' })
    })

    await waitFor(() => {
      expect(mutResult.current.isSuccess).toBe(true)
    })

    // Both composite keys should have been refetched
    await waitFor(() => {
      expect(getUserCall).toHaveBeenCalledTimes(4) // 2 initial + 2 invalidation refetches
    })
  })
})

// ====================
// isFetching vs isLoading
// ====================

describe('createApiComposer — isFetching vs isLoading', () => {
  beforeEach(() => {
    useApiStore.getState().resetAll()
    vi.clearAllMocks()
  })

  it('isFetching is true during any fetch, isLoading only on first load', async () => {
    let resolveCall: ((value: User[]) => void) | undefined
    let callCount = 0
    const listUsersCall = vi.fn(() => {
      callCount++
      return new Promise<User[]>(resolve => {
        resolveCall = resolve
      })
    })

    const useModernApi = createApiComposer<ModernApi>({
      queries: { listUsers: listUsersCall }
    })

    const { result } = renderHook(() => useModernApi('listUsers', {}))

    // During first load: both isFetching and isLoading should be true
    await waitFor(() => {
      expect(result.current.isFetching).toBe(true)
    })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeNull()

    // Resolve first call
    await act(async () => {
      resolveCall!([{ id: 1, name: 'John', email: 'john@test.com' }])
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.isFetching).toBe(false)
    expect(result.current.isLoading).toBe(false)

    // Trigger a refetch imperatively
    act(() => {
      result.current.query()
    })

    // During refetch: isFetching = true, but isLoading = false (data exists)
    await waitFor(() => {
      expect(result.current.isFetching).toBe(true)
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).not.toBeNull()

    // Resolve second call
    await act(async () => {
      resolveCall!([{ id: 1, name: 'John', email: 'john@test.com' }, { id: 2, name: 'Jane', email: 'jane@test.com' }])
    })

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false)
    })
    expect(result.current.isLoading).toBe(false)
  })
})
