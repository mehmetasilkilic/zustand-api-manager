import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onWindowFocus, onReconnect } from '../focusManager'

describe('onWindowFocus', () => {
  beforeEach(() => {
    // Reset visibilityState to visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true
    })
  })

  it('fires callback when document becomes visible', () => {
    const cb = vi.fn()
    const unsub = onWindowFocus(cb)

    // Simulate tab becoming visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('does NOT fire callback when document becomes hidden', () => {
    const cb = vi.fn()
    const unsub = onWindowFocus(cb)

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(cb).not.toHaveBeenCalled()
    unsub()
  })

  it('supports multiple subscribers', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = onWindowFocus(cb1)
    const unsub2 = onWindowFocus(cb2)

    document.dispatchEvent(new Event('visibilitychange'))

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()
  })

  it('unsubscribes correctly — only remaining subscribers fire', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = onWindowFocus(cb1)
    const unsub2 = onWindowFocus(cb2)

    unsub1()

    document.dispatchEvent(new Event('visibilitychange'))

    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledTimes(1)

    unsub2()
  })

  it('removes DOM listener when last subscriber unsubscribes', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const cb = vi.fn()
    const unsub = onWindowFocus(cb)
    unsub()

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('re-attaches DOM listener when new subscriber joins after all unsubscribed', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')

    const cb1 = vi.fn()
    const unsub1 = onWindowFocus(cb1)
    unsub1()

    const initialCallCount = addSpy.mock.calls.filter(
      c => c[0] === 'visibilitychange'
    ).length

    const cb2 = vi.fn()
    const unsub2 = onWindowFocus(cb2)

    const newCallCount = addSpy.mock.calls.filter(
      c => c[0] === 'visibilitychange'
    ).length

    expect(newCallCount).toBe(initialCallCount + 1)

    document.dispatchEvent(new Event('visibilitychange'))
    expect(cb2).toHaveBeenCalledTimes(1)

    unsub2()
    addSpy.mockRestore()
  })
})

describe('onReconnect', () => {
  it('fires callback on online event', () => {
    const cb = vi.fn()
    const unsub = onReconnect(cb)

    window.dispatchEvent(new Event('online'))

    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('supports multiple subscribers', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = onReconnect(cb1)
    const unsub2 = onReconnect(cb2)

    window.dispatchEvent(new Event('online'))

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()
  })

  it('unsubscribes correctly', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = onReconnect(cb1)
    const unsub2 = onReconnect(cb2)

    unsub1()

    window.dispatchEvent(new Event('online'))

    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledTimes(1)

    unsub2()
  })

  it('removes DOM listener when last subscriber unsubscribes', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const cb = vi.fn()
    const unsub = onReconnect(cb)
    unsub()

    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
    removeSpy.mockRestore()
  })
})
