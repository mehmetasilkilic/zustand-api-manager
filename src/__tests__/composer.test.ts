import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useApiStore } from '../store'
import { createApiComposer } from '../composer'
import { ApiEndpoint, FetchStatus } from '../types'

interface TestApi {
  getUsers: ApiEndpoint<void, { id: number; name: string }[]>
  getPost: ApiEndpoint<{ id: number }, { title: string }>
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
  })

  it('handleApi triggers loading then success with typed data', async () => {
    const { result } = renderHook(() => useApi('getUsers'))

    await act(async () => {
      await result.current.handleApi(() =>
        Promise.resolve({ data: [{ id: 1, name: 'Alice' }] })
      )
    })

    expect(result.current.isSuccess).toBe(true)
    expect(result.current.data).toEqual([{ id: 1, name: 'Alice' }])
  })

  it('handleApi triggers error state', async () => {
    const { result } = renderHook(() => useApi('getPost'))

    await act(async () => {
      await result.current.handleApi(() => Promise.reject(new Error('not found')))
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error!.message).toBe('not found')
    expect(result.current.data).toBeNull()
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
})

