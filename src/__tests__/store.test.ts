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
    expect(state.fetchedAt).toBeNull()
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

  it('calls onSuccess callback with response data', async () => {
    const onSuccess = vi.fn()
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall, { onSuccess })
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(onSuccess).toHaveBeenCalledWith('ok')
  })

  it('returns the response data on success', async () => {
    const apiCall = () => Promise.resolve({ data: { id: 1 } })
    const result = await getState().handleApi('users', apiCall)
    expect(result).toEqual({ id: 1 })
  })

  it('sets fetchedAt timestamp on success', async () => {
    const before = Date.now()
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall)
    const after = Date.now()
    const fetchedAt = getState().apiStates['users'].fetchedAt!
    expect(fetchedAt).toBeGreaterThanOrEqual(before)
    expect(fetchedAt).toBeLessThanOrEqual(after)
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

  it('calls onError callback with error', async () => {
    const onError = vi.fn()
    const apiCall = () => Promise.reject(new Error('fail'))
    await getState().handleApi('users', apiCall, { onError })
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'fail' }))
  })

  it('calls registered error handlers', async () => {
    const handler = vi.fn()
    getState().addErrorHandler(handler)
    const apiCall = () => Promise.reject(new Error('boom'))
    await getState().handleApi('users', apiCall)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), 'users')
  })

  it('returns undefined on error', async () => {
    const apiCall = () => Promise.reject(new Error('fail'))
    const result = await getState().handleApi('users', apiCall)
    expect(result).toBeUndefined()
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

  it('aborts during retry backoff sleep', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let callCount = 0
    const apiCall = () => {
      callCount++
      return Promise.reject(new Error('fail'))
    }

    const promise = getState().handleApi('users', apiCall, {
      retry: 3,
      signal: controller.signal
    })

    // Let the first attempt fail and start the backoff
    await vi.advanceTimersByTimeAsync(0)

    // Abort during the backoff sleep
    controller.abort()
    await vi.runAllTimersAsync()
    await promise

    // Should have only attempted once before abort killed the sleep
    expect(callCount).toBe(1)
    expect(getState().apiStates['users'].status).toBe(FetchStatus.ERROR)
    expect(getState().apiStates['users'].error!.code).toBe('ABORT_ERR')
    vi.useRealTimers()
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

// ── handleApi — race condition ───────────────────────────────

describe('handleApi — race condition', () => {
  it('discards stale response when a newer request is made', async () => {
    let resolveFirst: (value: { data: string }) => void
    const firstCall = () =>
      new Promise<{ data: string }>(resolve => {
        resolveFirst = resolve
      })

    const secondCall = () => Promise.resolve({ data: 'second' })

    // Start first request
    const firstPromise = getState().handleApi('users', firstCall)

    // Start second request (supersedes the first)
    const secondPromise = getState().handleApi('users', secondCall)
    await secondPromise

    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
    expect(getState().apiStates['users'].data).toBe('second')

    // Now resolve the first (stale) request — it should be discarded
    resolveFirst!({ data: 'first' })
    await firstPromise

    // State should still reflect the second (latest) request
    expect(getState().apiStates['users'].data).toBe('second')
  })

  it('discards stale error when a newer request succeeds', async () => {
    let rejectFirst: (reason: Error) => void
    const firstCall = () =>
      new Promise<{ data: string }>((_, reject) => {
        rejectFirst = reject
      })

    const secondCall = () => Promise.resolve({ data: 'success' })

    const firstPromise = getState().handleApi('users', firstCall)
    const secondPromise = getState().handleApi('users', secondCall)
    await secondPromise

    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)

    // First request errors — should be discarded
    rejectFirst!(new Error('stale error'))
    await firstPromise

    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
    expect(getState().apiStates['users'].error).toBeNull()
  })

  it('returns undefined for stale requests', async () => {
    let resolveFirst: (value: { data: string }) => void
    const firstCall = () =>
      new Promise<{ data: string }>(resolve => {
        resolveFirst = resolve
      })
    const secondCall = () => Promise.resolve({ data: 'second' })

    const firstPromise = getState().handleApi('users', firstCall)
    const secondResult = await getState().handleApi('users', secondCall)

    expect(secondResult).toBe('second')

    resolveFirst!({ data: 'first' })
    const firstResult = await firstPromise

    expect(firstResult).toBeUndefined()
  })
})

// ── handleApi — staleTime / cache ────────────────────────────

describe('handleApi — staleTime', () => {
  it('skips fetch and returns cached data when within staleTime', async () => {
    const apiCall = vi.fn(() => Promise.resolve({ data: 'fresh' }))

    // First call populates the cache
    await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(1)

    // Second call should be served from cache
    const result = await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(1)
    expect(result).toBe('fresh')
  })

  it('refetches when staleTime has elapsed', async () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() => Promise.resolve({ data: 'data' }))

    await getState().handleApi('users', apiCall, { staleTime: 1000 })
    expect(apiCall).toHaveBeenCalledTimes(1)

    // Advance time past staleTime
    vi.advanceTimersByTime(1500)

    await getState().handleApi('users', apiCall, { staleTime: 1000 })
    expect(apiCall).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('does not cache when staleTime is not provided', async () => {
    const apiCall = vi.fn(() => Promise.resolve({ data: 'data' }))

    await getState().handleApi('users', apiCall)
    await getState().handleApi('users', apiCall)
    expect(apiCall).toHaveBeenCalledTimes(2)
  })
})

// ── handleApi — optimistic updates ──────────────────────────

describe('handleApi — optimistic updates', () => {
  it('sets optimistic data immediately in LOADING state', async () => {
    let resolveApiCall: (value: { data: string }) => void
    const apiCall = () =>
      new Promise<{ data: string }>(resolve => {
        resolveApiCall = resolve
      })

    const promise = getState().handleApi('users', apiCall, {
      optimisticData: 'optimistic'
    })

    // Should be LOADING with optimistic data
    const state = getState().apiStates['users']
    expect(state.status).toBe(FetchStatus.LOADING)
    expect(state.data).toBe('optimistic')

    resolveApiCall!({ data: 'real' })
    await promise

    // Should now have the real data
    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
    expect(getState().apiStates['users'].data).toBe('real')
  })

  it('rolls back optimistic data on error', async () => {
    // Set initial data
    getState().setApiState('users', {
      status: FetchStatus.SUCCESS,
      data: 'original'
    })

    const apiCall = () => Promise.reject(new Error('fail'))
    await getState().handleApi('users', apiCall, {
      optimisticData: 'optimistic'
    })

    // Should have rolled back to original data
    expect(getState().apiStates['users'].status).toBe(FetchStatus.ERROR)
    expect(getState().apiStates['users'].data).toBe('original')
  })

  it('rolls back to null when there was no previous data', async () => {
    const apiCall = () => Promise.reject(new Error('fail'))
    await getState().handleApi('users', apiCall, {
      optimisticData: 'optimistic'
    })

    expect(getState().apiStates['users'].status).toBe(FetchStatus.ERROR)
    expect(getState().apiStates['users'].data).toBeNull()
  })
})

// ── handleApi — fresh errorHandlers ─────────────────────────

describe('handleApi — fresh errorHandlers', () => {
  it('calls error handlers added after handleApi started', async () => {
    let rejectApiCall: (reason: Error) => void
    const apiCall = () =>
      new Promise<{ data: string }>((_, reject) => {
        rejectApiCall = reject
      })

    const promise = getState().handleApi('users', apiCall)

    // Add handler AFTER the request started
    const handler = vi.fn()
    getState().addErrorHandler(handler)

    rejectApiCall!(new Error('late error'))
    await promise

    // Handler added after handleApi started should still be called
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'late error' }),
      'users'
    )
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

// ── unsubscribe ──────────────────────────────────────────────

describe('unsubscribe', () => {
  it('addMiddleware returns unsubscribe function that removes middleware', () => {
    const mw: ApiMiddleware = next => next
    const unsub = getState().addMiddleware(mw)
    expect(getState().middleware).toHaveLength(1)

    unsub()
    expect(getState().middleware).toHaveLength(0)
  })

  it('addErrorHandler returns unsubscribe function that removes handler', () => {
    const handler = vi.fn()
    const unsub = getState().addErrorHandler(handler)
    expect(getState().errorHandlers).toHaveLength(1)

    unsub()
    expect(getState().errorHandlers).toHaveLength(0)
  })

  it('unsubscribed error handler is not called on failure', async () => {
    const handler = vi.fn()
    const unsub = getState().addErrorHandler(handler)
    unsub()

    const apiCall = () => Promise.reject(new Error('fail'))
    await getState().handleApi('users', apiCall)
    expect(handler).not.toHaveBeenCalled()
  })
})
