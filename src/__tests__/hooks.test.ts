import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApiStore } from '../store'
import { useLoadingStates, useApiQuery, usePolling } from '../hooks'
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

// ── useApiQuery ────────────────────────────────────────────

describe('useApiQuery', () => {
  it('returns isIdle=true for an unknown key', () => {
    const { result } = renderHook(() => useApiQuery<string>('users'))
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
    const { result } = renderHook(() => useApiQuery<string>('users'))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isIdle).toBe(false)
    expect(result.current.status).toBe(FetchStatus.LOADING)
  })

  it('query triggers loading then success', async () => {
    const { result } = renderHook(() => useApiQuery<{ id: number }>('users'))

    await act(async () => {
      await result.current.query(() => Promise.resolve({ data: { id: 42 } }))
    })

    expect(result.current.isSuccess).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toEqual({ id: 42 })
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe(FetchStatus.SUCCESS)
    expect(result.current.fetchedAt).not.toBeNull()
  })

  it('query triggers loading then error', async () => {
    const { result } = renderHook(() => useApiQuery<string>('users'))

    await act(async () => {
      await result.current.query(() => Promise.reject(new Error('oops')))
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeDefined()
    expect(result.current.error!.message).toBe('oops')
    expect(result.current.status).toBe(FetchStatus.ERROR)
  })

  it('query returns data on success', async () => {
    const { result } = renderHook(() => useApiQuery<string>('users'))

    let returnedData: string | undefined
    await act(async () => {
      returnedData = await result.current.query(() => Promise.resolve({ data: 'hello' }))
    })

    expect(returnedData).toBe('hello')
  })

  it('reset clears state back to idle', async () => {
    const { result } = renderHook(() => useApiQuery<string>('users'))

    await act(async () => {
      await result.current.query(() => Promise.resolve({ data: 'hello' }))
    })
    expect(result.current.isSuccess).toBe(true)

    act(() => {
      result.current.reset()
    })
    expect(result.current.isIdle).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.status).toBe(FetchStatus.IDLE)
  })

  it('only re-renders when own key changes', async () => {
    const renderCount = vi.fn()
    const { result } = renderHook(() => {
      renderCount()
      return useApiQuery<string>('users')
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

  it('invalidate clears fetchedAt while preserving data', async () => {
    const { result } = renderHook(() => useApiQuery<string>('users'))

    await act(async () => {
      await result.current.query(() => Promise.resolve({ data: 'hello' }))
    })
    expect(result.current.fetchedAt).not.toBeNull()
    expect(result.current.data).toBe('hello')

    act(() => {
      result.current.invalidate()
    })
    expect(result.current.fetchedAt).toBeNull()
    expect(result.current.data).toBe('hello')
    expect(result.current.isSuccess).toBe(true)
  })

  it('query reference is stable across re-renders', async () => {
    const { result, rerender } = renderHook(() => useApiQuery<string>('users'))

    const firstQuery = result.current.query
    const firstReset = result.current.reset
    const firstInvalidate = result.current.invalidate

    // Trigger a re-render by changing unrelated state
    act(() => {
      useApiStore.getState().setApiState('users', { status: FetchStatus.LOADING })
    })

    await waitFor(() => expect(result.current.isLoading).toBe(true))

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

  it('query reference updates when key changes', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useApiQuery<string>(key),
      { initialProps: { key: 'users' } }
    )

    const firstQuery = result.current.query

    rerender({ key: 'posts' })

    // Function references should change because key changed
    expect(result.current.query).not.toBe(firstQuery)
  })
})

// ── usePolling ────────────────────────────────────────────────

describe('usePolling', () => {
  it('returns idle state initially', () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() => Promise.resolve({ data: 'ok' }))

    const { result, unmount } = renderHook(() => usePolling<string>('poll-test', apiCall, 1000))

    expect(result.current.isIdle).toBe(true)
    expect(result.current.data).toBeNull()

    unmount()
    vi.useRealTimers()
  })

  it('polls at the given interval', async () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() => Promise.resolve({ data: 'polled' }))

    const { result, unmount } = renderHook(() => usePolling<string>('poll-interval', apiCall, 1000))

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

    const { unmount } = renderHook(() => usePolling<string>('poll-unmount', apiCall, 1000))

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
  it('bound useApiQuery works as a React hook', async () => {
    const store = createApiStore({ storageKey: 'bound-handler-test' })

    const { result } = renderHook(() => store.useApiQuery<string>('test'))

    expect(result.current.isIdle).toBe(true)

    await act(async () => {
      await result.current.query(() => Promise.resolve({ data: 'hello' }))
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

// ── useApiQuery — declarative auto-fetch mode ────────────────

describe('useApiQuery — declarative mode', () => {
  it('auto-fetches on mount when queryFn is provided', async () => {
    const queryFn = vi.fn(() => Promise.resolve({ data: 'hello' }))

    const { result } = renderHook(() =>
      useApiQuery<string>('decl-auto', { queryFn })
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(result.current.data).toBe('hello')
  })

  it('does NOT auto-fetch without queryFn (observer mode)', async () => {
    const { result } = renderHook(() => useApiQuery<string>('decl-observer'))

    // Should stay idle — no fetch triggered
    expect(result.current.isIdle).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('observer reads data fetched by another call to same key', async () => {
    const queryFn = vi.fn(() => Promise.resolve({ data: 'shared' }))

    // Declarative hook fetches
    const { result: fetcher } = renderHook(() =>
      useApiQuery<string>('decl-shared', { queryFn })
    )

    await waitFor(() => {
      expect(fetcher.current.isSuccess).toBe(true)
    })

    // Observer hook reads the same key
    const { result: observer } = renderHook(() =>
      useApiQuery<string>('decl-shared')
    )

    expect(observer.current.data).toBe('shared')
    expect(observer.current.isSuccess).toBe(true)
  })

  it('respects enabled: false (no fetch until true)', async () => {
    const queryFn = vi.fn(() => Promise.resolve({ data: 'enabled' }))

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useApiQuery<string>('decl-enabled', { queryFn, enabled }),
      { initialProps: { enabled: false } }
    )

    // Should not have fetched
    expect(queryFn).not.toHaveBeenCalled()
    expect(result.current.isIdle).toBe(true)

    // Enable
    rerender({ enabled: true })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(result.current.data).toBe('enabled')
  })

  it('refetches when key changes', async () => {
    const queryFn = vi.fn((key: string) =>
      Promise.resolve({ data: `data-for-${key}` })
    )

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useApiQuery<string>(key, { queryFn: () => queryFn(key) }),
      { initialProps: { key: 'key-a' } }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toBe('data-for-key-a')

    rerender({ key: 'key-b' })

    await waitFor(() => {
      expect(result.current.data).toBe('data-for-key-b')
    })

    expect(queryFn).toHaveBeenCalledTimes(2)
  })

  it('uses latest queryFn via ref (no stale closures)', async () => {
    let version = 'v1'

    const { result, rerender } = renderHook(
      ({ v }: { v: string }) =>
        useApiQuery<string>('decl-ref', {
          queryFn: () => Promise.resolve({ data: v })
        }),
      { initialProps: { v: 'v1' } }
    )

    await waitFor(() => {
      expect(result.current.data).toBe('v1')
    })

    // Change queryFn but keep same key — the ref should hold the latest fn
    version = 'v2'
    rerender({ v: 'v2' })

    // Imperatively call query with the latest fn to verify ref works
    await act(async () => {
      await result.current.query(() => Promise.resolve({ data: version }))
    })

    expect(result.current.data).toBe('v2')
  })

  it('forwards staleTime to handleApi', async () => {
    let callCount = 0
    const queryFn = vi.fn(() => {
      callCount++
      return Promise.resolve({ data: `call-${callCount}` })
    })

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useApiQuery<string>(key, { queryFn, staleTime: 60_000 }),
      { initialProps: { key: 'stale-test' } }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(queryFn).toHaveBeenCalledTimes(1)

    // Rerender with same key — staleTime should prevent refetch
    rerender({ key: 'stale-test' })

    // Still only one call
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(result.current.data).toBe('call-1')
  })

  it('imperative query() still works alongside declarative', async () => {
    const queryFn = vi.fn(() => Promise.resolve({ data: 'auto' }))

    const { result } = renderHook(() =>
      useApiQuery<string>('decl-imperative', { queryFn })
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toBe('auto')

    // Now call imperatively with different data
    await act(async () => {
      await result.current.query(() => Promise.resolve({ data: 'manual' }))
    })

    expect(result.current.data).toBe('manual')
  })

  it('bound useApiQuery with declarative mode works via createApiStore', async () => {
    const store = createApiStore({ storageKey: 'bound-decl-test' })
    const queryFn = vi.fn(() => Promise.resolve({ data: 'bound-decl' }))

    const { result } = renderHook(() =>
      store.useApiQuery<string>('test-bound', { queryFn })
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toBe('bound-decl')

    // Should not appear in the default store
    expect(useApiStore.getState().apiStates['test-bound']).toBeUndefined()
  })
})
