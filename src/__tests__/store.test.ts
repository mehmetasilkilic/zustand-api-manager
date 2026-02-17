import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useApiStore, createApiStore } from '../store'
import { createApiStore as createApiStoreFromIndex } from '../index'
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

  it('does not change persistentKeys when persist is omitted', () => {
    getState().setApiState('users', { status: FetchStatus.IDLE }, true)
    expect(getState().persistentKeys['users']).toBe(true)
    // Update state without specifying persist — should NOT remove from persistentKeys
    getState().setApiState('users', { data: 'updated' })
    expect(getState().persistentKeys['users']).toBe(true)
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

// ── handleApi — timeout ──────────────────────────────────────

describe('handleApi — timeout', () => {
  it('aborts with TIMEOUT code when request exceeds timeout', async () => {
    vi.useFakeTimers()
    const apiCall = () => new Promise<{ data: string }>(() => {}) // never resolves

    const promise = getState().handleApi('users', apiCall, { timeout: 1000 })

    await vi.advanceTimersByTimeAsync(1000)
    await vi.runAllTimersAsync()
    await promise

    const state = getState().apiStates['users']
    expect(state.status).toBe(FetchStatus.ERROR)
    expect(state.error!.code).toBe('TIMEOUT')
    expect(state.error!.message).toBe('Request timed out')
    vi.useRealTimers()
  })

  it('succeeds normally when request completes before timeout', async () => {
    const apiCall = () => Promise.resolve({ data: 'fast' })
    const result = await getState().handleApi('users', apiCall, { timeout: 5000 })
    expect(result).toBe('fast')
    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
  })

  it('respects user abort signal even when timeout is set', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const apiCall = () => new Promise<{ data: string }>(() => {})

    const promise = getState().handleApi('users', apiCall, {
      timeout: 5000,
      signal: controller.signal
    })

    // Abort before timeout
    controller.abort()
    await vi.runAllTimersAsync()
    await promise

    const state = getState().apiStates['users']
    expect(state.status).toBe(FetchStatus.ERROR)
    expect(state.error!.code).toBe('ABORT_ERR')
    vi.useRealTimers()
  })

  it('calls onError callback with timeout error', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const apiCall = () => new Promise<{ data: string }>(() => {})

    const promise = getState().handleApi('users', apiCall, { timeout: 500, onError })

    await vi.advanceTimersByTimeAsync(500)
    await vi.runAllTimersAsync()
    await promise

    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'TIMEOUT' }))
    vi.useRealTimers()
  })
})

// ── handleApi — shouldRetry ──────────────────────────────────

describe('handleApi — shouldRetry', () => {
  it('stops retrying when shouldRetry returns false', async () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() =>
      Promise.reject(Object.assign(new Error('auth fail'), { status: 401 }))
    )

    const promise = getState().handleApi('users', apiCall, {
      retry: 3,
      shouldRetry: error => error.status !== 401
    })

    await vi.runAllTimersAsync()
    await promise

    // Should only call once — no retries because shouldRetry returned false
    expect(apiCall).toHaveBeenCalledTimes(1)
    expect(getState().apiStates['users'].status).toBe(FetchStatus.ERROR)
    expect(getState().apiStates['users'].error!.status).toBe(401)
    vi.useRealTimers()
  })

  it('retries when shouldRetry returns true', async () => {
    vi.useFakeTimers()
    let callCount = 0
    const apiCall = () => {
      callCount++
      if (callCount < 3) return Promise.reject(new Error('transient'))
      return Promise.resolve({ data: 'ok' })
    }

    const promise = getState().handleApi('users', apiCall, {
      retry: 3,
      shouldRetry: () => true
    })

    await vi.runAllTimersAsync()
    await promise

    expect(callCount).toBe(3)
    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
    vi.useRealTimers()
  })
})

// ── handleApi — custom backoff ───────────────────────────────

describe('handleApi — custom backoff', () => {
  it('uses custom backoff function for retry delays', async () => {
    vi.useFakeTimers()
    const backoff = vi.fn((attempt: number) => 100 * (attempt + 1))
    const apiCall = vi.fn(() => Promise.reject(new Error('fail')))

    const promise = getState().handleApi('users', apiCall, {
      retry: 2,
      backoff
    })

    await vi.runAllTimersAsync()
    await promise

    // backoff called for attempt 0 and attempt 1 (not for last attempt)
    expect(backoff).toHaveBeenCalledWith(0)
    expect(backoff).toHaveBeenCalledWith(1)
    expect(apiCall).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
})

// ── handleApi — onSettled ────────────────────────────────────

describe('handleApi — onSettled', () => {
  it('calls onSettled after success', async () => {
    const onSettled = vi.fn()
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall, { onSettled })
    expect(onSettled).toHaveBeenCalledOnce()
  })

  it('calls onSettled after error', async () => {
    const onSettled = vi.fn()
    const apiCall = () => Promise.reject(new Error('fail'))
    await getState().handleApi('users', apiCall, { onSettled })
    expect(onSettled).toHaveBeenCalledOnce()
  })

  it('calls onSettled after onSuccess', async () => {
    const order: string[] = []
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall, {
      onSuccess: () => order.push('success'),
      onSettled: () => order.push('settled')
    })
    expect(order).toEqual(['success', 'settled'])
  })

  it('calls onSettled after onError', async () => {
    const order: string[] = []
    const apiCall = () => Promise.reject(new Error('fail'))
    await getState().handleApi('users', apiCall, {
      onError: () => order.push('error'),
      onSettled: () => order.push('settled')
    })
    expect(order).toEqual(['error', 'settled'])
  })
})

// ── handleApi — deduplication ────────────────────────────────

describe('handleApi — deduplication', () => {
  it('returns same promise for concurrent calls with dedupe', async () => {
    let resolveApiCall: (value: { data: string }) => void
    const apiCall = vi.fn(
      () =>
        new Promise<{ data: string }>(resolve => {
          resolveApiCall = resolve
        })
    )

    const promise1 = getState().handleApi('users', apiCall, { dedupe: true })
    const promise2 = getState().handleApi('users', apiCall, { dedupe: true })

    // Should be the same promise
    expect(promise1).toBe(promise2)
    // API should only be called once
    expect(apiCall).toHaveBeenCalledTimes(1)

    resolveApiCall!({ data: 'shared' })
    const [result1, result2] = await Promise.all([promise1, promise2])

    expect(result1).toBe('shared')
    expect(result2).toBe('shared')
  })

  it('starts fresh request after previous deduped request completes', async () => {
    const apiCall = vi.fn(() => Promise.resolve({ data: 'data' }))

    await getState().handleApi('users', apiCall, { dedupe: true })
    expect(apiCall).toHaveBeenCalledTimes(1)

    await getState().handleApi('users', apiCall, { dedupe: true })
    expect(apiCall).toHaveBeenCalledTimes(2)
  })

  it('does not dedupe when option is not set', async () => {
    let resolveFirst: (value: { data: string }) => void
    const firstCall = vi.fn(
      () =>
        new Promise<{ data: string }>(resolve => {
          resolveFirst = resolve
        })
    )
    const secondCall = vi.fn(() => Promise.resolve({ data: 'second' }))

    const promise1 = getState().handleApi('users', firstCall)
    const promise2 = getState().handleApi('users', secondCall)

    resolveFirst!({ data: 'first' })
    await Promise.all([promise1, promise2])

    // Both should be called
    expect(firstCall).toHaveBeenCalledTimes(1)
    expect(secondCall).toHaveBeenCalledTimes(1)
  })
})

// ── invalidateApi ────────────────────────────────────────────

describe('invalidateApi', () => {
  it('clears fetchedAt timestamp', async () => {
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall)
    expect(getState().apiStates['users'].fetchedAt).not.toBeNull()

    getState().invalidateApi('users')
    expect(getState().apiStates['users'].fetchedAt).toBeNull()
  })

  it('preserves existing data and status', async () => {
    const apiCall = () => Promise.resolve({ data: 'mydata' })
    await getState().handleApi('users', apiCall)

    getState().invalidateApi('users')
    expect(getState().apiStates['users'].data).toBe('mydata')
    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
  })

  it('causes staleTime to refetch after invalidation', async () => {
    const apiCall = vi.fn(() => Promise.resolve({ data: 'data' }))

    // First call populates cache
    await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(1)

    // Second call served from cache
    await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(1)

    // Invalidate
    getState().invalidateApi('users')

    // Third call refetches because cache was invalidated
    await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(2)
  })

  it('is a no-op for unknown keys', () => {
    // Should not throw
    getState().invalidateApi('unknown')
    expect(getState().apiStates['unknown']).toBeUndefined()
  })
})

// ── invalidateApis (batch) ───────────────────────────────────

describe('invalidateApis', () => {
  it('clears fetchedAt for multiple keys in a single update', async () => {
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall)
    await getState().handleApi('posts', apiCall)
    expect(getState().apiStates['users'].fetchedAt).not.toBeNull()
    expect(getState().apiStates['posts'].fetchedAt).not.toBeNull()

    getState().invalidateApis(['users', 'posts'])
    expect(getState().apiStates['users'].fetchedAt).toBeNull()
    expect(getState().apiStates['posts'].fetchedAt).toBeNull()
  })

  it('preserves data and status for all keys', async () => {
    const apiCall = () => Promise.resolve({ data: 'mydata' })
    await getState().handleApi('users', apiCall)
    await getState().handleApi('posts', apiCall)

    getState().invalidateApis(['users', 'posts'])
    expect(getState().apiStates['users'].data).toBe('mydata')
    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
    expect(getState().apiStates['posts'].data).toBe('mydata')
    expect(getState().apiStates['posts'].status).toBe(FetchStatus.SUCCESS)
  })

  it('skips unknown keys without error', () => {
    getState().invalidateApis(['unknown1', 'unknown2'])
    expect(getState().apiStates['unknown1']).toBeUndefined()
    expect(getState().apiStates['unknown2']).toBeUndefined()
  })

  it('causes staleTime to refetch after batch invalidation', async () => {
    const apiCall = vi.fn(() => Promise.resolve({ data: 'data' }))

    await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    await getState().handleApi('posts', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(2)

    // Both served from cache
    await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    await getState().handleApi('posts', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(2)

    // Batch invalidate
    getState().invalidateApis(['users', 'posts'])

    // Both refetch
    await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    await getState().handleApi('posts', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(4)
  })
})

// ── resetApiStates (batch) ───────────────────────────────────

describe('resetApiStates', () => {
  it('deletes state for multiple keys in a single update', async () => {
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall)
    await getState().handleApi('posts', apiCall)

    getState().resetApiStates(['users', 'posts'])
    expect(getState().apiStates['users']).toBeUndefined()
    expect(getState().apiStates['posts']).toBeUndefined()
  })

  it('removes all keys from persistentKeys', async () => {
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall, { persist: true })
    await getState().handleApi('posts', apiCall, { persist: true })
    expect(getState().persistentKeys['users']).toBe(true)
    expect(getState().persistentKeys['posts']).toBe(true)

    getState().resetApiStates(['users', 'posts'])
    expect(getState().persistentKeys['users']).toBeUndefined()
    expect(getState().persistentKeys['posts']).toBeUndefined()
  })

  it('leaves other keys untouched', async () => {
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall)
    await getState().handleApi('posts', apiCall)
    await getState().handleApi('comments', apiCall)

    getState().resetApiStates(['users', 'posts'])
    expect(getState().apiStates['users']).toBeUndefined()
    expect(getState().apiStates['posts']).toBeUndefined()
    expect(getState().apiStates['comments']).toBeDefined()
    expect(getState().apiStates['comments'].data).toBe('ok')
  })

  it('is a no-op for unknown keys', () => {
    getState().resetApiStates(['unknown1', 'unknown2'])
    expect(getState().apiStates['unknown1']).toBeUndefined()
  })
})

// ── store isolation ───────────────────────────────────────────

describe('store isolation', () => {
  it('different stores using the same key do not interfere', async () => {
    const storeA = createApiStore({ storageKey: 'store-a' })
    const storeB = createApiStore({ storageKey: 'store-b' })

    await storeA.useStore.getState().handleApi('users', () => Promise.resolve({ data: 'from-a' }))
    await storeB.useStore.getState().handleApi('users', () => Promise.resolve({ data: 'from-b' }))

    expect(storeA.useStore.getState().apiStates['users'].data).toBe('from-a')
    expect(storeB.useStore.getState().apiStates['users'].data).toBe('from-b')
  })

  it('race condition tracking is isolated per store', async () => {
    const storeA = createApiStore({ storageKey: 'store-a2' })
    const storeB = createApiStore({ storageKey: 'store-b2' })

    let resolveA: (value: { data: string }) => void
    const slowCallA = () =>
      new Promise<{ data: string }>(resolve => {
        resolveA = resolve
      })

    // Start a slow request on storeA
    const promiseA = storeA.useStore.getState().handleApi('users', slowCallA)

    // storeB makes a quick request with the same key — should not affect storeA
    await storeB.useStore.getState().handleApi('users', () => Promise.resolve({ data: 'fast-b' }))

    // Resolve storeA's request — should NOT be treated as stale
    resolveA!({ data: 'slow-a' })
    await promiseA

    expect(storeA.useStore.getState().apiStates['users'].data).toBe('slow-a')
    expect(storeB.useStore.getState().apiStates['users'].data).toBe('fast-b')
  })

  it('deduplication is isolated per store', async () => {
    const storeA = createApiStore({ storageKey: 'store-a3' })
    const storeB = createApiStore({ storageKey: 'store-b3' })

    let resolveA: (value: { data: string }) => void
    const callA = vi.fn(
      () =>
        new Promise<{ data: string }>(resolve => {
          resolveA = resolve
        })
    )
    const callB = vi.fn(() => Promise.resolve({ data: 'b' }))

    // Start a deduped request on storeA
    const promiseA = storeA.useStore.getState().handleApi('users', callA, { dedupe: true })

    // storeB deduped request with same key — should NOT share storeA's promise
    await storeB.useStore.getState().handleApi('users', callB, { dedupe: true })

    expect(callA).toHaveBeenCalledTimes(1)
    expect(callB).toHaveBeenCalledTimes(1)

    resolveA!({ data: 'a' })
    await promiseA
  })

  it('resetApiState on one store does not affect another', async () => {
    const storeA = createApiStore({ storageKey: 'store-a4' })
    const storeB = createApiStore({ storageKey: 'store-b4' })

    const apiCall = () => Promise.resolve({ data: 'ok' })

    await storeA.useStore.getState().handleApi('users', apiCall)
    await storeB.useStore.getState().handleApi('users', apiCall)

    storeA.useStore.getState().resetApiState('users')

    expect(storeA.useStore.getState().apiStates['users']).toBeUndefined()
    expect(storeB.useStore.getState().apiStates['users'].data).toBe('ok')
  })
})

// ── handleApi — throwOnError ──────────────────────────────────

describe('handleApi — throwOnError', () => {
  it('rejects with ApiError when throwOnError is true and request fails', async () => {
    const apiCall = () => Promise.reject(new Error('fail'))
    await expect(getState().handleApi('users', apiCall, { throwOnError: true })).rejects.toThrow(
      'fail'
    )
  })

  it('resolves with data when throwOnError is true and request succeeds', async () => {
    const apiCall = () => Promise.resolve({ data: 'ok' })
    const result = await getState().handleApi('users', apiCall, { throwOnError: true })
    expect(result).toBe('ok')
  })

  it('still updates store state to ERROR before rejecting', async () => {
    const apiCall = () => Promise.reject(new Error('fail'))
    try {
      await getState().handleApi('users', apiCall, { throwOnError: true })
    } catch {
      // expected
    }
    expect(getState().apiStates['users'].status).toBe(FetchStatus.ERROR)
    expect(getState().apiStates['users'].error!.message).toBe('fail')
  })

  it('resolves to undefined without throwing when throwOnError is not set', async () => {
    const apiCall = () => Promise.reject(new Error('fail'))
    const result = await getState().handleApi('users', apiCall)
    expect(result).toBeUndefined()
  })

  it('includes status and code on thrown error', async () => {
    const err = Object.assign(new Error('not found'), { status: 404, code: 'NOT_FOUND' })
    const apiCall = () => Promise.reject(err)
    try {
      await getState().handleApi('users', apiCall, { throwOnError: true })
      expect.unreachable('should have thrown')
    } catch (e) {
      const error = e as { status?: number; code?: string; message: string }
      expect(error.message).toBe('not found')
      expect(error.status).toBe(404)
      expect(error.code).toBe('NOT_FOUND')
    }
  })
})

// ── resetAll ──────────────────────────────────────────────────

describe('resetAll', () => {
  it('clears all API states', async () => {
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall)
    await getState().handleApi('posts', apiCall)
    await getState().handleApi('comments', apiCall)

    getState().resetAll()

    expect(Object.keys(getState().apiStates)).toHaveLength(0)
  })

  it('clears all persistentKeys', async () => {
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall, { persist: true })
    await getState().handleApi('posts', apiCall, { persist: true })

    getState().resetAll()

    expect(Object.keys(getState().persistentKeys)).toHaveLength(0)
  })

  it('is a no-op when store is already empty', () => {
    getState().resetAll()
    expect(Object.keys(getState().apiStates)).toHaveLength(0)
  })
})

// ── invalidateAll ─────────────────────────────────────────────

describe('invalidateAll', () => {
  it('clears fetchedAt for all keys', async () => {
    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('users', apiCall)
    await getState().handleApi('posts', apiCall)

    expect(getState().apiStates['users'].fetchedAt).not.toBeNull()
    expect(getState().apiStates['posts'].fetchedAt).not.toBeNull()

    getState().invalidateAll()

    expect(getState().apiStates['users'].fetchedAt).toBeNull()
    expect(getState().apiStates['posts'].fetchedAt).toBeNull()
  })

  it('preserves data and status for all keys', async () => {
    const apiCall = () => Promise.resolve({ data: 'mydata' })
    await getState().handleApi('users', apiCall)
    await getState().handleApi('posts', apiCall)

    getState().invalidateAll()

    expect(getState().apiStates['users'].data).toBe('mydata')
    expect(getState().apiStates['users'].status).toBe(FetchStatus.SUCCESS)
    expect(getState().apiStates['posts'].data).toBe('mydata')
    expect(getState().apiStates['posts'].status).toBe(FetchStatus.SUCCESS)
  })

  it('causes staleTime to refetch all keys after invalidation', async () => {
    const apiCall = vi.fn(() => Promise.resolve({ data: 'data' }))

    await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    await getState().handleApi('posts', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(2)

    // Both served from cache
    await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    await getState().handleApi('posts', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(2)

    getState().invalidateAll()

    // Both refetch
    await getState().handleApi('users', apiCall, { staleTime: 60_000 })
    await getState().handleApi('posts', apiCall, { staleTime: 60_000 })
    expect(apiCall).toHaveBeenCalledTimes(4)
  })

  it('is a no-op when store is empty', () => {
    getState().invalidateAll()
    expect(Object.keys(getState().apiStates)).toHaveLength(0)
  })
})

// ── createApiStore — custom storage ──────────────────────────

describe('createApiStore — custom storage', () => {
  it('accepts a custom synchronous storage backend', async () => {
    const storage: Record<string, string> = {}
    const customStorage = {
      getItem: (name: string) => storage[name] ?? null,
      setItem: (name: string, value: string) => {
        storage[name] = value
      },
      removeItem: (name: string) => {
        delete storage[name]
      }
    }

    const { useStore } = createApiStore({ storageKey: 'custom-sync', storage: customStorage })
    const apiCall = () => Promise.resolve({ data: 'persisted' })
    await useStore.getState().handleApi('test', apiCall, { persist: true })

    expect(useStore.getState().apiStates['test'].data).toBe('persisted')
    expect(useStore.getState().persistentKeys['test']).toBe(true)
    // Storage should contain the persisted data
    expect(storage['custom-sync']).toBeDefined()
    const parsed = JSON.parse(storage['custom-sync'])
    expect(parsed.state.apiStates['test'].data).toBe('persisted')
  })

  it('accepts a custom async storage backend', async () => {
    const storage: Record<string, string> = {}
    const asyncStorage = {
      getItem: async (name: string) => storage[name] ?? null,
      setItem: async (name: string, value: string) => {
        storage[name] = value
      },
      removeItem: async (name: string) => {
        delete storage[name]
      }
    }

    const { useStore } = createApiStore({ storageKey: 'custom-async', storage: asyncStorage })
    const apiCall = () => Promise.resolve({ data: 'async-data' })
    await useStore.getState().handleApi('test', apiCall, { persist: true })

    expect(useStore.getState().apiStates['test'].data).toBe('async-data')
  })
})

// ── createApiStore from index (factory with bound hooks) ─────

describe('createApiStore from index — factory with bound hooks', () => {
  it('returns useStore and bound utilities', () => {
    const result = createApiStoreFromIndex({ storageKey: 'factory-test' })
    expect(result.useStore).toBeDefined()
    expect(result.useLoadingStates).toBeDefined()
    expect(result.createApiComposer).toBeDefined()
  })

  it('bound hooks operate on the correct isolated store', async () => {
    const store = createApiStoreFromIndex({ storageKey: 'factory-isolated' })

    // Use the raw store to verify
    await store.useStore
      .getState()
      .handleApi('test', () => Promise.resolve({ data: 'factory-data' }))

    expect(store.useStore.getState().apiStates['test'].data).toBe('factory-data')
    // Default store should not have this data
    expect(useApiStore.getState().apiStates['test']).toBeUndefined()
  })

  it('factory stores are isolated from each other', async () => {
    const storeA = createApiStoreFromIndex({ storageKey: 'factory-a' })
    const storeB = createApiStoreFromIndex({ storageKey: 'factory-b' })

    await storeA.useStore.getState().handleApi('users', () => Promise.resolve({ data: 'a-data' }))
    await storeB.useStore.getState().handleApi('users', () => Promise.resolve({ data: 'b-data' }))

    expect(storeA.useStore.getState().apiStates['users'].data).toBe('a-data')
    expect(storeB.useStore.getState().apiStates['users'].data).toBe('b-data')
  })
})

// ── middleware — error handling ───────────────────────────────

describe('middleware — error handling', () => {
  it('propagates error when middleware throws', async () => {
    const mw: ApiMiddleware = () => async () => {
      throw new Error('middleware-crash')
    }
    getState().addMiddleware(mw)

    const apiCall = () => Promise.resolve({ data: 'ok' })
    await expect(getState().handleApi('users', apiCall)).rejects.toThrow('middleware-crash')
  })

  it('middleware can modify the api call', async () => {
    const mw: ApiMiddleware = next => async (key, _apiCall, options) => {
      // Replace the api call with a different one
      const modifiedCall = () => Promise.resolve({ data: 'intercepted' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await next(key, modifiedCall as any, options as any)
    }
    getState().addMiddleware(mw)

    const apiCall = () => Promise.resolve({ data: 'original' })
    await getState().handleApi('users', apiCall)

    expect(getState().apiStates['users'].data).toBe('intercepted')
  })

  it('middleware can short-circuit and not call next', async () => {
    const apiCall = vi.fn(() => Promise.resolve({ data: 'ok' }))
    const mw: ApiMiddleware = () => async () => {
      // Intentionally do nothing — don't call next
    }
    getState().addMiddleware(mw)

    const result = await getState().handleApi('users', apiCall)

    // The apiCall should not have been invoked
    expect(apiCall).not.toHaveBeenCalled()
    // State was never touched by baseHandler, so it remains uninitialized
    // and handleApi returns undefined
    expect(result).toBeUndefined()
  })

  it('unsubscribed middleware is not applied to subsequent calls', async () => {
    const calls: string[] = []
    const mw: ApiMiddleware = next => async (key, apiCall, options) => {
      calls.push('mw')
      await next(key, apiCall, options)
    }

    const unsub = getState().addMiddleware(mw)

    const apiCall = () => Promise.resolve({ data: 'ok' })
    await getState().handleApi('first', apiCall)
    expect(calls).toEqual(['mw'])

    unsub()

    await getState().handleApi('second', apiCall)
    // Middleware should not have been called again
    expect(calls).toEqual(['mw'])
  })
})

// ── handleApi — timeout + retry interaction ──────────────────

describe('handleApi — timeout + retry interaction', () => {
  it('timeout triggers during retry backoff and stops retries', async () => {
    vi.useFakeTimers()
    const apiCall = vi.fn(() => Promise.reject(new Error('fail')))

    const promise = getState().handleApi('users', apiCall, {
      retry: 5,
      timeout: 1500 // timeout after 1.5s — first backoff is 1s, so it should abort during second backoff
    })

    // First attempt fails immediately, starts 1000ms backoff
    await vi.advanceTimersByTimeAsync(0)
    expect(apiCall).toHaveBeenCalledTimes(1)

    // Advance through first backoff (1000ms)
    await vi.advanceTimersByTimeAsync(1000)
    // Second attempt should fire
    expect(apiCall).toHaveBeenCalledTimes(2)

    // Second backoff is 2000ms, but timeout fires at 1500ms total
    // We've used 1000ms already, so timeout fires at 500ms into second backoff
    await vi.advanceTimersByTimeAsync(500)
    await vi.runAllTimersAsync()
    await promise

    const state = getState().apiStates['users']
    expect(state.status).toBe(FetchStatus.ERROR)
    expect(state.error!.code).toBe('TIMEOUT')
    // Should have stopped before exhausting all retries
    expect(apiCall).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })
})

// ── handleApi — onSettled with middleware crash ──────────────

describe('handleApi — onSettled with middleware crash', () => {
  it('calls onSettled even when middleware throws', async () => {
    const onSettled = vi.fn()
    const mw: ApiMiddleware = () => async () => {
      throw new Error('middleware-crash')
    }
    getState().addMiddleware(mw)

    const apiCall = () => Promise.resolve({ data: 'ok' })
    await expect(getState().handleApi('users', apiCall, { onSettled })).rejects.toThrow(
      'middleware-crash'
    )

    expect(onSettled).toHaveBeenCalledOnce()
  })
})

// ── activeRequests cleanup ───────────────────────────────────

describe('activeRequests cleanup', () => {
  it('subsequent requests work after cleanup of previous request tracking', async () => {
    const apiCall1 = () => Promise.resolve({ data: 'first' })
    const apiCall2 = () => Promise.resolve({ data: 'second' })
    const apiCall3 = () => Promise.resolve({ data: 'third' })

    await getState().handleApi('users', apiCall1)
    expect(getState().apiStates['users'].data).toBe('first')

    await getState().handleApi('users', apiCall2)
    expect(getState().apiStates['users'].data).toBe('second')

    await getState().handleApi('users', apiCall3)
    expect(getState().apiStates['users'].data).toBe('third')
  })

  it('race condition still works after cleanup', async () => {
    let resolveFirst: (value: { data: string }) => void
    const firstCall = () =>
      new Promise<{ data: string }>(resolve => {
        resolveFirst = resolve
      })
    const secondCall = () => Promise.resolve({ data: 'second' })
    const thirdCall = () => Promise.resolve({ data: 'third' })

    // First request (will be stale)
    const firstPromise = getState().handleApi('users', firstCall)

    // Second request supersedes
    await getState().handleApi('users', secondCall)
    expect(getState().apiStates['users'].data).toBe('second')

    // Resolve stale first
    resolveFirst!({ data: 'first' })
    await firstPromise
    expect(getState().apiStates['users'].data).toBe('second')

    // Third request should work normally after cleanup
    await getState().handleApi('users', thirdCall)
    expect(getState().apiStates['users'].data).toBe('third')
  })
})

// ── normalizeError — cause ───────────────────────────────────

describe('normalizeError — cause', () => {
  it('attaches cause when non-Error value is thrown', async () => {
    const apiCall = () => Promise.reject({ custom: 'error-object' })
    await getState().handleApi('users', apiCall)
    const error = getState().apiStates['users'].error!
    expect(error.message).toBe('An unknown error occurred')
    expect((error as Error & { cause?: unknown }).cause).toEqual({ custom: 'error-object' })
  })

  it('does not attach cause when Error instance is thrown', async () => {
    const apiCall = () => Promise.reject(new Error('real error'))
    await getState().handleApi('users', apiCall)
    const error = getState().apiStates['users'].error!
    expect(error.message).toBe('real error')
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined()
  })
})

// ── persistence rehydration ──────────────────────────────────

describe('persistence rehydration', () => {
  it('persisted keys survive store recreation with same storage', async () => {
    const storage: Record<string, string> = {}
    const customStorage = {
      getItem: (name: string) => storage[name] ?? null,
      setItem: (name: string, value: string) => {
        storage[name] = value
      },
      removeItem: (name: string) => {
        delete storage[name]
      }
    }

    // Create first store and persist data
    const store1 = createApiStore({ storageKey: 'rehydrate-test', storage: customStorage })
    await store1.useStore
      .getState()
      .handleApi('users', () => Promise.resolve({ data: 'persisted-data' }), { persist: true })

    expect(store1.useStore.getState().apiStates['users'].data).toBe('persisted-data')
    expect(storage['rehydrate-test']).toBeDefined()

    // Create a second store with the same key and storage — should rehydrate
    const store2 = createApiStore({ storageKey: 'rehydrate-test', storage: customStorage })

    // Wait for rehydration (Zustand's persist middleware rehydrates asynchronously)
    await vi.waitFor(() => {
      expect(store2.useStore.getState().apiStates['users']).toBeDefined()
    })

    expect(store2.useStore.getState().apiStates['users'].data).toBe('persisted-data')
    expect(store2.useStore.getState().persistentKeys['users']).toBe(true)
  })

  it('non-persisted keys are not rehydrated', async () => {
    const storage: Record<string, string> = {}
    const customStorage = {
      getItem: (name: string) => storage[name] ?? null,
      setItem: (name: string, value: string) => {
        storage[name] = value
      },
      removeItem: (name: string) => {
        delete storage[name]
      }
    }

    const store1 = createApiStore({ storageKey: 'rehydrate-selective', storage: customStorage })
    await store1.useStore
      .getState()
      .handleApi('persisted', () => Promise.resolve({ data: 'saved' }), { persist: true })
    await store1.useStore
      .getState()
      .handleApi('ephemeral', () => Promise.resolve({ data: 'not-saved' }))

    // Verify the storage only contains the persisted key
    const parsed = JSON.parse(storage['rehydrate-selective'])
    expect(parsed.state.apiStates['persisted']).toBeDefined()
    expect(parsed.state.apiStates['ephemeral']).toBeUndefined()

    // New store should only have the persisted key
    const store2 = createApiStore({ storageKey: 'rehydrate-selective', storage: customStorage })
    await vi.waitFor(() => {
      expect(store2.useStore.getState().apiStates['persisted']).toBeDefined()
    })
    expect(store2.useStore.getState().apiStates['ephemeral']).toBeUndefined()
  })
})
