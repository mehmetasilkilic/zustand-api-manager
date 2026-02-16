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
    Promise.resolve({ data: { id: params.id, name: 'John Doe', email: 'john@example.com' } })
  ),
  listUsers: vi.fn(() =>
    Promise.resolve({
      data: [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' }
      ]
    })
  ),
  createUser: vi.fn((payload: CreateUserPayload) =>
    Promise.resolve({ data: { id: 3, ...payload } })
  ),
  deleteUser: vi.fn(() => Promise.resolve({ data: undefined }))
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
      Promise.resolve({ data: { ok: true } })
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
