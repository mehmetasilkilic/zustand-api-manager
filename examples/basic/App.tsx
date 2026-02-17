import React from 'react'
import { createApiComposer, ApiQueryEndpoint } from 'zustand-api-manager'

interface User {
  id: number
  name: string
  email: string
}

const api = {
  getUser: async (params: { id: number }): Promise<User> => {
    const response = await fetch(`https://jsonplaceholder.typicode.com/users/${params.id}`)
    if (!response.ok) throw new Error('Failed to fetch user')
    return response.json()
  }
}

interface MyApi {
  getUser: ApiQueryEndpoint<{ id: number }, User>
}

const useApi = createApiComposer<MyApi>({
  queries: {
    getUser: (params) => api.getUser(params)
  }
})

export default function App() {
  // Declarative mode — auto-fetches on mount
  const { data, isLoading, isError, error, reset } = useApi('getUser', {
    params: { id: 1 },
    persist: true,
    staleTime: 60_000,
    retry: 2,
    onSuccess: user => {
      console.log('User loaded:', user.name)
    }
  })

  if (isLoading) return <div>Loading...</div>
  if (isError) return <div>Error: {error?.message}</div>

  return (
    <div>
      <h1>User Profile</h1>
      {data && (
        <div>
          <p>Name: {data.name}</p>
          <p>Email: {data.email}</p>
        </div>
      )}
      <button onClick={reset}>Reset</button>
    </div>
  )
}
