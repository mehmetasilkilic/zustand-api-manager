import { ApiState, FetchStatus } from './types'

/**
 * The default state for a newly tracked API endpoint.
 * Status is `IDLE`, with no data, no error, and no fetch timestamp.
 */
export const initialApiState: ApiState<unknown> = {
  status: FetchStatus.IDLE,
  data: null,
  error: null,
  fetchedAt: null
}

/**
 * The `localStorage` key used by the Zustand `persist` middleware
 * to store API states marked for persistence.
 */
export const STORAGE_KEY = 'api_store'
