import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useApiStore } from '../store'
import { FetchStatus } from '../types'
import type { ApiMiddleware } from '../types'

const getState = () => useApiStore.getState()

beforeEach(() => {
  useApiStore.setState({
    apiStates: {},
    persistentKeys: {},
    middleware: [],
    errorHandlers: []
  })
})

// ── setApiState ──────────────────────────────────────────────

describe('setApiState', () => {
  it('initializes a new key with the provided state', () => {
    getState().setApiState('users', { status: FetchStatus.LOADING })
    const state = getState().apiStates['users']
    expect(state).toBeDefined()
    expect(state.status).toBe(FetchStatus.LOADING)
    expect(state.data).toBeNull()
    expect(state.error).toBeNull()
  })

  it('merges partial state into an existing key', () => {
    getState().setApiState('users', { status: FetchStatus.LOADING })
    getState().setApiState('users', { data: [{ id: 1 }] })
    const state = getState().apiStates['users']
    expect(state.status).toBe(FetchStatus.LOADING)
    expect(state.data).toEqual([{ id: 1 }])
  })

  it('adds key to persistentKeys when persist=true', () => {
    getState().setApiState('users', { status: FetchStatus.IDLE }, true)
    expect(getState().persistentKeys['users']).toBe(true)
  })

  it('removes key from persistentKeys when persist=false', () => {
    getState().setApiState('users', { status: FetchStatus.IDLE }, true)
    expect(getState().persistentKeys['users']).toBe(true)
    getState().setApiState('users', { status: FetchStatus.IDLE }, false)
    expect(getState().persistentKeys['users']).toBeUndefined()
  })
})

// ── resetApiState ────────────────────────────────────────────

describe('resetApiState', () => {
  it('deletes the API state for a key', () => {
    getState().setApiState('users', { status: FetchStatus.SUCCESS, data: 'hello' })
    getState().resetApiState('users')
    expect(getState().apiStates['users']).toBeUndefined()
  })

  it('removes key from persistentKeys', () => {
    getState().setApiState('users', { status: FetchStatus.IDLE }, true)
    getState().resetApiState('users')
    expect(getState().persistentKeys['users']).toBeUndefined()
  })
})

// ── handleApi — success path ─────────────────────────────────

describe('handleApi — success path', () => {
  it('sets status to LOADING then SUCCESS', async () => {
    let resolveApiCall: (value: { data: string }) => void
    const apiCall = () =>
      new Promise<{ data: string }>(resolve => {
        resolveApiCall = resolve
      })

    const promise = getState().handleApi('users', apiCall)
    // Should be LOADING while the promise is pending
    expect(getState().apiStates['users']?.status).toBe(FetchStatus.LOADING)

    resolveApiCall!({ data: 'result' })
    await promise

    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
  })

  it('stores the response data', async () => {
    const apiCall = () => Promise.resolve({ data: { id: 1, name: 'test' } })
    await getState().handleApi('users', apiCall)
    expect(getState().apiStates['users'].data).toEqual({ id: 1, name: 'test' })
  })

  it('calls onSuccess callback', async () => {
    const onSuccess = vi.fn()
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall, { onSuccess })
    expect(onSuccess).toHaveBeenCalledOnce()
  })
})

// ── handleApi — error path ───────────────────────────────────

describe('handleApi — error path', () => {
  it('sets status to LOADING then ERROR', async () => {
    let rejectApiCall: (reason: Error) => void
    const apiCall = () =>
      new Promise<{ data: string }>((_, reject) => {
        rejectApiCall = reject
      })

    const promise = getState().handleApi('users', apiCall)
    expect(getState().apiStates['users']?.status).toBe(FetchStatus.LOADING)

    rejectApiCall!(new Error('fail'))
    await promise

    expect(getState().apiStates['users'].status).toBe(FetchStatus.ERROR)
  })

  it('creates ApiError from Error instances', async () => {
    const apiCall = () => Promise.reject(new Error('something broke'))
    await getState().handleApi('users', apiCall)
    const error = getState().apiStates['users'].error!
    expect(error.message).toBe('something broke')
  })

  it('creates ApiError from non-Error throws', async () => {
    const apiCall = () => Promise.reject('string error')
    await getState().handleApi('users', apiCall)
    const error = getState().apiStates['users'].error!
    expect(error.message).toBe('An unknown error occurred')
  })

  it('extracts status and code from error objects', async () => {
    const err = Object.assign(new Error('api fail'), { status: 404, code: 'NOT_FOUND' })
    const apiCall = () => Promise.reject(err)
    await getState().handleApi('users', apiCall)
    const error = getState().apiStates['users'].error!
    expect(error.status).toBe(404)
    expect(error.code).toBe('NOT_FOUND')
  })

  it('calls onError callback', async () => {
    const onError = vi.fn()
    const apiCall = () => Promise.reject(new Error('fail'))
    await getState().handleApi('users', apiCall, { onError })
    expect(onError).toHaveBeenCalledOnce()
  })

  it('calls registered error handlers', async () => {
    const handler = vi.fn()
    getState().addErrorHandler(handler)
    const apiCall = () => Promise.reject(new Error('boom'))
    await getState().handleApi('users', apiCall)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), 'users')
  })
})

// ── handleApi — persistence ──────────────────────────────────

describe('handleApi — persistence', () => {
  it('respects persist option during loading and success', async () => {
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall, { persist: true })
    expect(getState().persistentKeys['users']).toBe(true)
    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
  })

  it('respects persist option during error', async () => {
    const apiCall = () => Promise.reject(new Error('fail'))
    await getState().handleApi('users', apiCall, { persist: true })
    expect(getState().persistentKeys['users']).toBe(true)
    expect(getState().apiStates['users'].status).toBe(FetchStatus.ERROR)
  })
})

// ── handleApi — abort ────────────────────────────────────────

describe('handleApi — abort', () => {
  it('sets ERROR with ABORT_ERR when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const apiCall = vi.fn(() => Promise.resolve({ data: 'ok' }))
    await getState().handleApi('users', apiCall, { signal: controller.signal })
    const state = getState().apiStates['users']
    expect(state.status).toBe(FetchStatus.ERROR)
    expect(state.error!.code).toBe('ABORT_ERR')
  })

  it('does not call onSuccess when aborted before resolve', async () => {
    const controller = new AbortController()
    const onSuccess = vi.fn()
    const apiCall = () =>
      new Promise<{ data: string }>((_, reject) => {
        controller.abort()
        reject(new Error('aborted'))
      })
    await getState().handleApi('users', apiCall, { signal: controller.signal, onSuccess })
    expect(onSuccess).not.toHaveBeenCalled()
    expect(getState().apiStates['users'].error!.code).toBe('ABORT_ERR')
  })
})

// ── handleApi — retry ────────────────────────────────────────

describe('handleApi — retry', () => {
  it('retries the specified number of times before failing', async () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() => Promise.reject(new Error('fail')))

    const promise = getState().handleApi('users', apiCall, { retry: 2 })

    // Flush all pending timers (retry back-off sleeps)
    await vi.runAllTimersAsync()
    await promise

    // 1 initial + 2 retries = 3 total calls
    expect(apiCall).toHaveBeenCalledTimes(3)
    expect(getState().apiStates['users'].status).toBe(FetchStatus.ERROR)
    vi.useRealTimers()
  })

  it('succeeds on a retry without hitting error state', async () => {
    vi.useFakeTimers()
    let callCount = 0
    const apiCall = () => {
      callCount++
      if (callCount < 3) return Promise.reject(new Error('fail'))
      return Promise.resolve({ data: 'recovered' })
    }

    const promise = getState().handleApi('users', apiCall, { retry: 3 })
    await vi.runAllTimersAsync()
    await promise

    expect(callCount).toBe(3)
    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
    expect(getState().apiStates['users'].data).toBe('recovered')
    vi.useRealTimers()
  })
})

// ── addMiddleware ────────────────────────────────────────────

describe('addMiddleware', () => {
  it('adds middleware to the store', () => {
    const mw: ApiMiddleware = next => next
    getState().addMiddleware(mw)
    expect(getState().middleware).toHaveLength(1)
  })

  it('middleware wraps the base handler (intercepts calls)', async () => {
    const calls: string[] = []
    const mw: ApiMiddleware = next => async (key, apiCall, options) => {
      calls.push('before')
      await next(key, apiCall, options)
      calls.push('after')
    }
    getState().addMiddleware(mw)

    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('test', apiCall)

    expect(calls).toEqual(['before', 'after'])
    expect(getState().apiStates['test'].status).toBe(FetchStatus.SUCCESS)
  })

  it('multiple middlewares compose in order', async () => {
    const order: number[] = []

    const mw1: ApiMiddleware = next => async (key, apiCall, options) => {
      order.push(1)
      await next(key, apiCall, options)
      order.push(4)
    }
    const mw2: ApiMiddleware = next => async (key, apiCall, options) => {
      order.push(2)
      await next(key, apiCall, options)
      order.push(3)
    }

    getState().addMiddleware(mw1)
    getState().addMiddleware(mw2)

    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('test', apiCall)

    // mw1 wraps mw2 wraps base — but reduce feeds mw1 first then mw2:
    // composedHandler = mw2(mw1(base))
    // so mw2 runs outermost, then mw1, then base
    expect(order).toEqual([2, 1, 4, 3])
  })
})

// ── addErrorHandler ──────────────────────────────────────────

describe('addErrorHandler', () => {
  it('adds error handler to the store', () => {
    const handler = vi.fn()
    getState().addErrorHandler(handler)
    expect(getState().errorHandlers).toHaveLength(1)
  })

  it('handler is called with error and key on API failure', async () => {
    const handler = vi.fn()
    getState().addErrorHandler(handler)
    const apiCall = () => Promise.reject(new Error('fail'))
    await getState().handleApi('users', apiCall)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ message: 'fail' }), 'users')
  })

  it('multiple handlers all get called', async () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    getState().addErrorHandler(h1)
    getState().addErrorHandler(h2)
    const apiCall = () => Promise.reject(new Error('fail'))
    await getState().handleApi('users', apiCall)
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })
})
