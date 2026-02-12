import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useApiStore } from '../store'
import { ApiCallOptions, FetchStatus } from '../types'

const getState = () => useApiStore.getState()

beforeEach(() => {
  useApiStore.setState({
    apiStates: {},
    persistentKeys: new Set<string>(),
    middleware: [],
    errorHandlers: []
  })
})

// ── useLoadingStates (tested via store state) ────────────────

describe('useLoadingStates logic', () => {
  it('returns true when any state is LOADING (no keys filter)', () => {
    getState().setApiState('a', { status: FetchStatus.IDLE })
    getState().setApiState('b', { status: FetchStatus.LOADING })

    const { apiStates } = getState()
    const anyLoading = Object.values(apiStates).some(s => s.status === FetchStatus.LOADING)
    expect(anyLoading).toBe(true)
  })

  it('returns false when nothing is loading', () => {
    getState().setApiState('a', { status: FetchStatus.SUCCESS })
    getState().setApiState('b', { status: FetchStatus.IDLE })

    const { apiStates } = getState()
    const anyLoading = Object.values(apiStates).some(s => s.status === FetchStatus.LOADING)
    expect(anyLoading).toBe(false)
  })

  it('returns true for a specific loading key', () => {
    getState().setApiState('a', { status: FetchStatus.LOADING })
    getState().setApiState('b', { status: FetchStatus.SUCCESS })

    const { apiStates } = getState()
    const keys = ['a']
    const isLoading = keys.some(key => apiStates[key]?.status === FetchStatus.LOADING)
    expect(isLoading).toBe(true)
  })

  it('returns false for a specific non-loading key', () => {
    getState().setApiState('a', { status: FetchStatus.LOADING })
    getState().setApiState('b', { status: FetchStatus.SUCCESS })

    const { apiStates } = getState()
    const keys = ['b']
    const isLoading = keys.some(key => apiStates[key]?.status === FetchStatus.LOADING)
    expect(isLoading).toBe(false)
  })

  it('accepts string or string[] for keys', () => {
    getState().setApiState('x', { status: FetchStatus.LOADING })
    const { apiStates } = getState()

    // single string wrapped to array
    const singleKey = 'x'
    const keyArray = Array.isArray(singleKey) ? singleKey : [singleKey]
    const isLoading = keyArray.some(key => apiStates[key]?.status === FetchStatus.LOADING)
    expect(isLoading).toBe(true)

    // array of strings
    const multiKeys = ['x', 'y']
    const isLoadingMulti = multiKeys.some(key => apiStates[key]?.status === FetchStatus.LOADING)
    expect(isLoadingMulti).toBe(true)
  })
})

// ── useApiHandler (tested via store state) ───────────────────

describe('useApiHandler logic', () => {
  it('returns correct boolean flags based on status', () => {
    getState().setApiState('users', { status: FetchStatus.LOADING })
    let state = getState().apiStates['users']
    expect(state.status === FetchStatus.LOADING).toBe(true)
    expect(state.status === FetchStatus.ERROR).toBe(false)
    expect(state.status === FetchStatus.SUCCESS).toBe(false)

    getState().setApiState('users', { status: FetchStatus.SUCCESS })
    state = getState().apiStates['users']
    expect(state.status === FetchStatus.SUCCESS).toBe(true)
    expect(state.status === FetchStatus.LOADING).toBe(false)

    getState().setApiState('users', { status: FetchStatus.ERROR })
    state = getState().apiStates['users']
    expect(state.status === FetchStatus.ERROR).toBe(true)
    expect(state.status === FetchStatus.SUCCESS).toBe(false)
  })

  it('returns data and error from state', async () => {
    const apiCall = () => Promise.resolve({ data: { id: 1 } })
    await getState().handleApi('users', apiCall)
    const state = getState().apiStates['users']
    expect(state.data).toEqual({ id: 1 })
    expect(state.error).toBeNull()

    const failCall = () => Promise.reject(new Error('oops'))
    await getState().handleApi('fail', failCall)
    const errorState = getState().apiStates['fail']
    expect(errorState.data).toBeNull()
    expect(errorState.error).toBeDefined()
    expect(errorState.error!.message).toBe('oops')
  })

  it('handleApi delegates to store handleApi with bound key', async () => {
    const handleApiSpy = vi.spyOn(getState(), 'handleApi')
    const apiCall = () => Promise.resolve({ data: 'result' })

    // Simulating what useApiHandler does: binding key
    const key = 'users'
    const boundHandleApi = (
      call: () => Promise<{ data: string }>,
      options?: ApiCallOptions
    ) => getState().handleApi(key, call, options)

    await boundHandleApi(apiCall)
    expect(handleApiSpy).toHaveBeenCalledWith('users', apiCall, undefined)
    handleApiSpy.mockRestore()
  })

  it('resetApi delegates to store resetApiState', () => {
    getState().setApiState('users', { status: FetchStatus.SUCCESS, data: 'hello' })
    expect(getState().apiStates['users']).toBeDefined()

    // Simulating what useApiHandler does
    const key = 'users'
    getState().resetApiState(key)

    expect(getState().apiStates['users']).toBeUndefined()
  })
})
