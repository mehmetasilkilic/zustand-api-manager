import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApiStore } from '../store'
import { createApiComposer } from '../composer'
import { ApiQueryEndpoint, ApiMutationEndpoint, FetchStatus } from '../types'

// ====================
// Unbound backward-compat tests (no queries config)
// ====================

interface TestApi {
  getUsers: ApiQueryEndpoint<void, { id: number; name: string }[]>
  getPost: ApiQueryEndpoint<{ id: number }, { title: string }>
}

const useApi = createApiComposer<TestApi>()

beforeEach(() => {
  useApiStore.setState({
    apiStates: {},
    persistentKeys: {},
    middleware: [],
    errorHandlers: []
  })
})

describe('createApiComposer', () => {
  it('returns idle state for a fresh key', () => {
    const { result } = renderHook(() => useApi('getUsers'))
    expect(result.current.isIdle).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isSuccess).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe(FetchStatus.IDLE)
    expect(result.current.fetchedAt).toBeNull()
  })

  it('query triggers loading then success with typed data (void params, unbound)', async () => {
    const { result } = renderHook(() => useApi('getUsers'))

    await act(async () => {
      // Unbound fallback: pass apiCall directly (runtime-only backward compat)
      await (result.current.query as (...args: unknown[]) => Promise<unknown>)(
        () => Promise.resolve({ data: [{ id: 1, name: 'Alice' }] })
      )
    })

    expect(result.current.isSuccess).toBe(true)
    expect(result.current.data).toEqual([{ id: 1, name: 'Alice' }])
    expect(result.current.status).toBe(FetchStatus.SUCCESS)
    expect(result.current.fetchedAt).not.toBeNull()
  })

  it('query triggers error state (unbound)', async () => {
    const { result } = renderHook(() => useApi('getPost'))

    await act(async () => {
      // Unbound fallback: pass params + apiCall directly
      await (result.current.query as (...args: unknown[]) => Promise<unknown>)(
        { id: 1 },
        () => Promise.reject(new Error('not found'))
      )
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error!.message).toBe('not found')
    expect(result.current.data).toBeNull()
    expect(result.current.status).toBe(FetchStatus.ERROR)
  })

  it('reflects external state changes', () => {
    const { result } = renderHook(() => useApi('getUsers'))
    expect(result.current.isIdle).toBe(true)

    act(() => {
      useApiStore
        .getState()
        .setApiState('getUsers', { status: FetchStatus.SUCCESS, data: [{ id: 2, name: 'Bob' }] })
    })

    expect(result.current.isSuccess).toBe(true)
    expect(result.current.data).toEqual([{ id: 2, name: 'Bob' }])
  })

  it('reset clears state back to idle', async () => {
    const { result } = renderHook(() => useApi('getUsers'))

    await act(async () => {
      await (result.current.query as (...args: unknown[]) => Promise<unknown>)(
        () => Promise.resolve({ data: [{ id: 1, name: 'Alice' }] })
      )
    })
    expect(result.current.isSuccess).toBe(true)

    act(() => {
      result.current.reset()
    })
    expect(result.current.isIdle).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.status).toBe(FetchStatus.IDLE)
  })
})

describe('createApiComposer — params passthrough', () => {
  it('passes params to the apiCall function for non-void endpoints (unbound)', async () => {
    const { result } = renderHook(() => useApi('getPost'))
    const apiCall = vi.fn((params: { id: number }) =>
      Promise.resolve({ data: { title: `Post ${params.id}` } })
    )

    await act(async () => {
      await (result.current.query as (...args: unknown[]) => Promise<unknown>)({ id: 42 }, apiCall)
    })

    expect(apiCall).toHaveBeenCalledWith({ id: 42 })
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.data).toEqual({ title: 'Post 42' })
  })

  it('passes undefined params for void endpoints (unbound)', async () => {
    const { result } = renderHook(() => useApi('getUsers'))
    const apiCall = vi.fn((_params: void) => Promise.resolve({ data: [{ id: 1, name: 'Alice' }] }))

    await act(async () => {
      await (result.current.query as (...args: unknown[]) => Promise<unknown>)(apiCall)
    })

    expect(apiCall).toHaveBeenCalledWith(undefined)
    expect(result.current.isSuccess).toBe(true)
  })
})

describe('createApiComposer — invalidate', () => {
  it('clears fetchedAt while preserving data', async () => {
    const { result } = renderHook(() => useApi('getUsers'))

    await act(async () => {
      await (result.current.query as (...args: unknown[]) => Promise<unknown>)(
        () => Promise.resolve({ data: [{ id: 1, name: 'Alice' }] })
      )
    })
    expect(result.current.fetchedAt).not.toBeNull()
    expect(result.current.isSuccess).toBe(true)

    act(() => {
      result.current.invalidate()
    })
    expect(result.current.fetchedAt).toBeNull()
    expect(result.current.data).toEqual([{ id: 1, name: 'Alice' }])
    expect(result.current.isSuccess).toBe(true)
  })
})

describe('createApiComposer — stable references', () => {
  it('query, reset, and invalidate are stable across re-renders', async () => {
    const { result, rerender } = renderHook(() => useApi('getUsers'))

    const firstQuery = result.current.query
    const firstReset = result.current.reset
    const firstInvalidate = result.current.invalidate

    // Trigger a state change
    act(() => {
      useApiStore.getState().setApiState('getUsers', { status: FetchStatus.LOADING })
    })

    expect(result.current.isLoading).toBe(true)

    // Function references should be the same
    expect(result.current.query).toBe(firstQuery)
    expect(result.current.reset).toBe(firstReset)
    expect(result.current.invalidate).toBe(firstInvalidate)

    // Also stable after a plain rerender
    rerender()
    expect(result.current.query).toBe(firstQuery)
    expect(result.current.reset).toBe(firstReset)
    expect(result.current.invalidate).toBe(firstInvalidate)
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
