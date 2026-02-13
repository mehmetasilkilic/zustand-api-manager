import React, { useEffect } from 'react'
import { createApiStore } from 'zustand-api-manager'

/**
 * Create an isolated store for this feature module.
 * This keeps feature state separate from the global app state.
 */
const {
  useStore: useFeatureStore,
  useApiQuery,
  useLoadingStates,
  usePrefetch
} = createApiStore({
  storageKey: 'feature-module',
  enableDevtools: true,
  devtoolsName: 'Feature Module Store'
})

interface FeatureData {
  id: number
  name: string
  config: Record<string, unknown>
}

const api = {
  getFeatureData: async (id: number): Promise<{ data: FeatureData }> => {
    const response = await fetch(`/api/features/${id}`)
    const data = await response.json()
    return { data }
  }
}

export default function FeatureModule() {
  const { data, isLoading, handleApi } = useApiQuery<FeatureData>('featureData')
  const isAnyLoading = useLoadingStates()
  const { prefetch } = usePrefetch()

  useEffect(() => {
    // Load initial data
    handleApi(() => api.getFeatureData(1), {
      persist: true,
      staleTime: 300_000 // Fresh for 5 minutes
    })

    // Prefetch next feature data
    prefetch('featureData-2', () => api.getFeatureData(2), {
      staleTime: 300_000
    })
  }, [handleApi, prefetch])

  // This component's state is completely isolated from other stores
  // You can reset just this feature's state without affecting global state
  const handleReset = () => {
    useFeatureStore.getState().resetAll()
  }

  return (
    <div>
      <h2>Feature Module (Isolated Store)</h2>

      {isAnyLoading && <div>Loading...</div>}

      {data && (
        <div>
          <p>Feature: {data.name}</p>
          <pre>{JSON.stringify(data.config, null, 2)}</pre>
        </div>
      )}

      <button onClick={handleReset}>Reset Feature State</button>

      <small style={{ display: 'block', marginTop: 10, color: '#666' }}>
        This module uses its own isolated store. Resetting here won't affect the main app state.
      </small>
    </div>
  )
}
