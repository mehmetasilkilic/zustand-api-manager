import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApiStore } from '../store'
import { useLoadingStates, useApiHandler, usePolling } from '../hooks'
import { createApiStore } from '../index'
import { FetchStatus } from '../types'

beforeEach(() => {
  useApiStore.setState({
    apiStates: {},
    persistentKeys: {},
    middleware: [],
    errorHandlers: []
  })
})

// ── useLoadingStates ─────────────────────────────────────────

describe('useLoadingStates', () => {
  it('returns true when any state is LOADING (no keys filter)', () => {
    useApiStore.getState().setApiState('a', { status: FetchStatus.IDLE })
    useApiStore.getState().setApiState('b', { status: FetchStatus.LOADING })

    const { result } = renderHook(() => useLoadingStates())
    expect(result.current).toBe(true)
  })

  it('returns false when nothing is loading', () => {
    useApiStore.getState().setApiState('a', { status: FetchStatus.SUCCESS })
    useApiStore.getState().setApiState('b', { status: FetchStatus.IDLE })

    const { result } = renderHook(() => useLoadingStates())
    expect(result.current).toBe(false)
  })

  it('returns true for a specific loading key', () => {
    useApiStore.getState().setApiState('a', { status: FetchStatus.LOADING })
    useApiStore.getState().setApiState('b', { status: FetchStatus.SUCCESS })

    const { result } = renderHook(() => useLoadingStates(['a']))
    expect(result.current).toBe(true)
  })

  it('returns false for a specific non-loading key', () => {
    useApiStore.getState().setApiState('a', { status: FetchStatus.LOADING })
    useApiStore.getState().setApiState('b', { status: FetchStatus.SUCCESS })

    const { result } = renderHook(() => useLoadingStates(['b']))
    expect(result.current).toBe(false)
  })

  it('accepts a single string key', () => {
    useApiStore.getState().setApiState('x', { status: FetchStatus.LOADING })

    const { result } = renderHook(() => useLoadingStates('x'))
    expect(result.current).toBe(true)
  })

  it('reacts to state changes', async () => {
    const { result } = renderHook(() => useLoadingStates('users'))
    expect(result.current).toBe(false)

    act(() => {
      useApiStore.getState().setApiState('users', { status: FetchStatus.LOADING })
    })
    await waitFor(() => expect(result.current).toBe(true))

    act(() => {
      useApiStore.getState().setApiState('users', { status: FetchStatus.SUCCESS })
    })
    await waitFor(() => expect(result.current).toBe(false))
  })
})

// ── useApiHandler ────────────────────────────────────────────

describe('useApiHandler', () => {
  it('returns isIdle=true for an unknown key', () => {
    const { result } = renderHook(() => useApiHandler<string>('users'))
    expect(result.current.isIdle).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(result.current.isSuccess).toBe(false)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe(FetchStatus.IDLE)
    expect(result.current.fetchedAt).toBeNull()
  })

  it('returns correct boolean flags based on status', () => {
    useApiStore.getState().setApiState('users', { status: FetchStatus.LOADING })
    const { result } = renderHook(() => useApiHandler<string>('users'))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isIdle).toBe(false)
    expect(result.current.status).toBe(FetchStatus.LOADING)
  })

  it('handleApi triggers loading then success', async () => {
    const { result } = renderHook(() => useApiHandler<{ id: number }>('users'))

    await act(async () => {
      await result.current.handleApi(() => Promise.resolve({ data: { id: 42 } }))
    })

    expect(result.current.isSuccess).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual({ id: 42 })
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe(FetchStatus.SUCCESS)
    expect(result.current.fetchedAt).not.toBeNull()
  })

  it('handleApi triggers loading then error', async () => {
    const { result } = renderHook(() => useApiHandler<string>('users'))

    await act(async () => {
      await result.current.handleApi(() => Promise.reject(new Error('oops')))
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeDefined()
    expect(result.current.error!.message).toBe('oops')
    expect(result.current.status).toBe(FetchStatus.ERROR)
  })

  it('handleApi returns data on success', async () => {
    const { result } = renderHook(() => useApiHandler<string>('users'))

    let returnedData: string | undefined
    await act(async () => {
      returnedData = await result.current.handleApi(() => Promise.resolve({ data: 'hello' }))
    })

    expect(returnedData).toBe('hello')
  })

  it('resetApi clears state back to idle', async () => {
    const { result } = renderHook(() => useApiHandler<string>('users'))

    await act(async () => {
      await result.current.handleApi(() => Promise.resolve({ data: 'hello' }))
    })
    expect(result.current.isSuccess).toBe(true)

    act(() => {
      result.current.resetApi()
    })
    expect(result.current.isIdle).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.status).toBe(FetchStatus.IDLE)
  })

  it('only re-renders when own key changes', async () => {
    const renderCount = vi.fn()
    const { result } = renderHook(() => {
      renderCount()
      return useApiHandler<string>('users')
    })

    const initialRenderCount = renderCount.mock.calls.length

    // Changing a *different* key should not cause re-render
    act(() => {
      useApiStore.getState().setApiState('posts', { status: FetchStatus.LOADING })
    })

    // Give React a tick to flush
    await waitFor(() => {
      // renderCount should not have increased
      expect(renderCount.mock.calls.length).toBe(initialRenderCount)
    })

    // Changing our key should cause re-render
    act(() => {
      useApiStore.getState().setApiState('users', { status: FetchStatus.LOADING })
    })
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true)
    })
  })

  it('invalidateApi clears fetchedAt while preserving data', async () => {
    const { result } = renderHook(() => useApiHandler<string>('users'))

    await act(async () => {
      await result.current.handleApi(() => Promise.resolve({ data: 'hello' }))
    })
    expect(result.current.fetchedAt).not.toBeNull()
    expect(result.current.data).toBe('hello')

    act(() => {
      result.current.invalidateApi()
    })
    expect(result.current.fetchedAt).toBeNull()
    expect(result.current.data).toBe('hello')
    expect(result.current.isSuccess).toBe(true)
  })

  it('handleApi reference is stable across re-renders', async () => {
    const { result, rerender } = renderHook(() => useApiHandler<string>('users'))

    const firstHandleApi = result.current.handleApi
    const firstResetApi = result.current.resetApi
    const firstInvalidateApi = result.current.invalidateApi

    // Trigger a re-render by changing unrelated state
    act(() => {
      useApiStore.getState().setApiState('users', { status: FetchStatus.LOADING })
    })

    await waitFor(() => expect(result.current.isLoading).toBe(true))

    // Function references should be the same
    expect(result.current.handleApi).toBe(firstHandleApi)
    expect(result.current.resetApi).toBe(firstResetApi)
    expect(result.current.invalidateApi).toBe(firstInvalidateApi)

    // Also stable after a plain rerender
    rerender()
    expect(result.current.handleApi).toBe(firstHandleApi)
    expect(result.current.resetApi).toBe(firstResetApi)
    expect(result.current.invalidateApi).toBe(firstInvalidateApi)
  })

  it('handleApi reference updates when key changes', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useApiHandler<string>(key),
      { initialProps: { key: 'users' } }
    )

    const firstHandleApi = result.current.handleApi

    rerender({ key: 'posts' })

    // Function references should change because key changed
    expect(result.current.handleApi).not.toBe(firstHandleApi)
  })
})

// ── usePolling ────────────────────────────────────────────────

describe('usePolling', () => {
  it('returns idle state initially', () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() => Promise.resolve({ data: 'ok' }))

    const { result, unmount } = renderHook(() =>
      usePolling<string>('poll-test', apiCall, 1000)
    )

    expect(result.current.isIdle).toBe(true)
    expect(result.current.data).toBeNull()

    unmount()
    vi.useRealTimers()
  })

  it('polls at the given interval', async () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() => Promise.resolve({ data: 'polled' }))

    const { result, unmount } = renderHook(() =>
      usePolling<string>('poll-interval', apiCall, 1000)
    )

    expect(apiCall).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(apiCall).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(apiCall).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBe('polled')

    unmount()
    vi.useRealTimers()
  })

  it('fires immediately when immediate is true', async () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() => Promise.resolve({ data: 'immediate' }))

    const { unmount } = renderHook(() =>
      usePolling<string>('poll-immediate', apiCall, 1000, { immediate: true })
    )

    // Should fire immediately without waiting
    expect(apiCall).toHaveBeenCalledTimes(1)

    unmount()
    vi.useRealTimers()
  })

  it('stops polling on unmount', async () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() => Promise.resolve({ data: 'ok' }))

    const { unmount } = renderHook(() =>
      usePolling<string>('poll-unmount', apiCall, 1000)
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(apiCall).toHaveBeenCalledTimes(1)

    unmount()

    await vi.advanceTimersByTimeAsync(5000)
    // Should not have called again after unmount
    expect(apiCall).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('pauses polling when enabled is false', async () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() => Promise.resolve({ data: 'ok' }))

    const { unmount, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        usePolling<string>('poll-enabled', apiCall, 1000, { enabled }),
      { initialProps: { enabled: false } }
    )

    await vi.advanceTimersByTimeAsync(3000)
    expect(apiCall).not.toHaveBeenCalled()

    // Enable polling
    rerender({ enabled: true })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(apiCall).toHaveBeenCalledTimes(1)

    unmount()
    vi.useRealTimers()
  })

  it('uses latest apiCall via ref without restarting interval', async () => {
    vi.useFakeTimers()
    let callVersion = 'v1'
    const apiCallV1 = () => Promise.resolve({ data: callVersion })

    const { result, rerender, unmount } = renderHook(
      ({ apiCall }: { apiCall: () => Promise<{ data: string }> }) =>
        usePolling<string>('poll-ref', apiCall, 1000),
      { initialProps: { apiCall: apiCallV1 } }
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.data).toBe('v1')

    // Change the apiCall reference and the version
    callVersion = 'v2'
    const apiCallV2 = () => Promise.resolve({ data: callVersion })
    rerender({ apiCall: apiCallV2 })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.data).toBe('v2')

    unmount()
    vi.useRealTimers()
  })
})

// ── createApiStore — bound hooks with renderHook ─────────────

describe('createApiStore — bound hooks with renderHook', () => {
  it('bound useApiHandler works as a React hook', async () => {
    const store = createApiStore({ storageKey: 'bound-handler-test' })

    const { result } = renderHook(() => store.useApiHandler<string>('test'))

    expect(result.current.isIdle).toBe(true)

    await act(async () => {
      await result.current.handleApi(() => Promise.resolve({ data: 'hello' }))
    })

    expect(result.current.isSuccess).toBe(true)
    expect(result.current.data).toBe('hello')

    // Should not appear in the default store
    expect(useApiStore.getState().apiStates['test']).toBeUndefined()
  })

  it('bound useLoadingStates works as a React hook', () => {
    const store = createApiStore({ storageKey: 'bound-loading-test' })

    store.useStore.getState().setApiState('x', { status: FetchStatus.LOADING })

    const { result } = renderHook(() => store.useLoadingStates('x'))
    expect(result.current).toBe(true)

    // Default store should not have this state
    const { result: defaultResult } = renderHook(() => useLoadingStates('x'))
    expect(defaultResult.current).toBe(false)
  })

  it('bound usePolling works as a React hook', async () => {
    vi.useFakeTimers()
    const store = createApiStore({ storageKey: 'bound-polling-test' })
    const apiCall = vi.fn(() => Promise.resolve({ data: 'polled' }))

    const { result, unmount } = renderHook(() =>
      store.usePolling<string>('poll-bound', apiCall, 1000, { immediate: true })
    )

    expect(apiCall).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.data).toBe('polled')

    // Default store should not have this state
    expect(useApiStore.getState().apiStates['poll-bound']).toBeUndefined()

    unmount()
    vi.useRealTimers()
  })
})
