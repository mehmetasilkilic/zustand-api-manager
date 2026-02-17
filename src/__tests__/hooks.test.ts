import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApiStore } from '../store'
import { useLoadingStates } from '../hooks'
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

// ── createApiStore — bound useLoadingStates ──────────────────

describe('createApiStore — bound useLoadingStates', () => {
  it('bound useLoadingStates works as a React hook', () => {
    const store = createApiStore({ storageKey: 'bound-loading-test' })

    store.useStore.getState().setApiState('x', { status: FetchStatus.LOADING })

    const { result } = renderHook(() => store.useLoadingStates('x'))
    expect(result.current).toBe(true)

    // Default store should not have this state
    const { result: defaultResult } = renderHook(() => useLoadingStates('x'))
    expect(defaultResult.current).toBe(false)
  })
})
