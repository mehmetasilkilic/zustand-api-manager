/** Recursively produces a stable JSON string with sorted object keys. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k])).join(',') + '}'
}

/**
 * Returns a composite cache key: bare `endpoint` when params is nullish,
 * otherwise `endpoint + "::" + stableStringify(params)`.
 */
export function compositeKey(endpoint: string, params: unknown): string {
  if (params === undefined || params === null) return endpoint
  return endpoint + '::' + stableStringify(params)
}
