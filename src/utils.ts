const API_CALL_OPTION_KEYS = new Set([
  'onStart',
  'onCacheHit',
  'onSuccess',
  'onError',
  'onBeforeRetry',
  'onSettled',
  'persist',
  'signal',
  'retry',
  'shouldRetry',
  'backoff',
  'staleTime',
  'revalidateOnStale',
  'optimisticData',
  'timeout',
  'dedupe',
  'throwOnError'
])

export function isApiCallOptions(arg: unknown): boolean {
  if (typeof arg !== 'object' || arg === null || Array.isArray(arg)) return false
  const keys = Object.keys(arg)
  return keys.length > 0 && keys.every(k => API_CALL_OPTION_KEYS.has(k))
}
