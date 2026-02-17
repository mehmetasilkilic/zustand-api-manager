import React from 'react'
import { createApiStore, ApiQueryEndpoint } from 'zustand-api-manager'

/**
 * Create an isolated store for this feature module.
 * This keeps feature state separate from the global app state.
 */
const {
  useStore: useFeatureStore,
  useLoadingStates,
  createApiComposer
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

interface FeatureApi {
  featureData: ApiQueryEndpoint<{ id: number }, FeatureData>
}

const api = {
  getFeatureData: async (params: { id: number }): Promise<{ data: FeatureData }> => {
    const response = await fetch(`/api/features/${params.id}`)
    const data = await response.json()
    return { data }
  }
}

const useApi = createApiComposer<FeatureApi>({
  queries: {
    featureData: (params) => api.getFeatureData(params)
  }
})

export default function FeatureModule() {
  // Declarative mode — auto-fetches on mount
  const { data, isLoading } = useApi('featureData', {
    params: { id: 1 },
    persist: true,
    staleTime: 300_000
  })

  const isAnyLoading = useLoadingStates()

  // Prefetch next feature data on hover
  const handlePrefetchNext = () => {
    useApi.prefetch('featureData', { id: 2 }, { staleTime: 300_000 })
  }

  // This component's state is completely isolated from other stores
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
      <button onMouseEnter={handlePrefetchNext}>Prefetch Next Feature</button>

      <small style={{ display: 'block', marginTop: 10, color: '#666' }}>
        This module uses its own isolated store. Resetting here won't affect the main app state.
      </small>
    </div>
  )
}
