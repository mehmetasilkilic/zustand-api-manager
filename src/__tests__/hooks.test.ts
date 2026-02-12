import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApiStore } from '../store'
import { useLoadingStates, useApiHandler, usePolling } from '../hooks'
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
})

// ── usePolling ──────────────────────────────────────────────

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls callback at the specified interval', () => {
    const callback = vi.fn()
    renderHook(() => usePolling(callback, 1000))

    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  it('does not poll when interval is null', () => {
    const callback = vi.fn()
    renderHook(() => usePolling(callback, null))

    vi.advanceTimersByTime(5000)
    expect(callback).not.toHaveBeenCalled()
  })

  it('does not poll when interval is 0', () => {
    const callback = vi.fn()
    renderHook(() => usePolling(callback, 0))

    vi.advanceTimersByTime(5000)
    expect(callback).not.toHaveBeenCalled()
  })

  it('cleans up interval on unmount', () => {
    const callback = vi.fn()
    const { unmount } = renderHook(() => usePolling(callback, 1000))

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    unmount()

    vi.advanceTimersByTime(3000)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('restarts interval when interval value changes', () => {
    const callback = vi.fn()
    const { rerender } = renderHook(({ interval }) => usePolling(callback, interval), {
      initialProps: { interval: 1000 as number | null }
    })

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    // Change to 500ms
    rerender({ interval: 500 })

    vi.advanceTimersByTime(500)
    expect(callback).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(500)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  it('stops polling when interval changes to null', () => {
    const callback = vi.fn()
    const { rerender } = renderHook(({ interval }) => usePolling(callback, interval), {
      initialProps: { interval: 1000 as number | null }
    })

    vi.advanceTimersByTime(1000)
    expect(callback).toHaveBeenCalledTimes(1)

    rerender({ interval: null })

    vi.advanceTimersByTime(5000)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
