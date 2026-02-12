import { ApiState, FetchStatus } from './types'

export const initialApiState: ApiState<unknown> = {
  status: FetchStatus.IDLE,
  data: null,
  error: null
}

export const STORAGE_KEY = 'api_store'
