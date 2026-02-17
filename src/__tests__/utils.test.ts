import { describe, it, expect } from 'vitest'
import { stableStringify } from '../utils'

describe('stableStringify', () => {
  it('returns empty string for undefined', () => {
    expect(stableStringify(undefined)).toBe('')
  })

  it('returns empty string for null', () => {
    expect(stableStringify(null)).toBe('')
  })

  it('serializes primitives', () => {
    expect(stableStringify(42)).toBe('42')
    expect(stableStringify('hello')).toBe('"hello"')
    expect(stableStringify(true)).toBe('true')
  })

  it('produces identical output regardless of key insertion order', () => {
    const a = { z: 1, a: 2, m: 3 }
    const b = { a: 2, m: 3, z: 1 }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('sorts keys alphabetically in output', () => {
    const result = stableStringify({ c: 3, a: 1, b: 2 })
    expect(result).toBe('{"a":1,"b":2,"c":3}')
  })

  it('handles nested objects with stable sorting', () => {
    const a = { outer: { z: 1, a: 2 }, key: 'val' }
    const b = { key: 'val', outer: { a: 2, z: 1 } }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('preserves array order (arrays are not sorted)', () => {
    const val = { items: [3, 1, 2] }
    expect(stableStringify(val)).toBe('{"items":[3,1,2]}')
  })

  it('handles arrays of objects with stable sorting', () => {
    const a = { list: [{ b: 2, a: 1 }] }
    const b = { list: [{ a: 1, b: 2 }] }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('handles empty objects and arrays', () => {
    expect(stableStringify({})).toBe('{}')
    expect(stableStringify([])).toBe('[]')
  })

  it('handles deeply nested structures', () => {
    const a = { l1: { l2: { l3: { z: 1, a: 2 } } } }
    const b = { l1: { l2: { l3: { a: 2, z: 1 } } } }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })
})

