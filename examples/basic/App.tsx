import React, { useEffect } from 'react'
import { useApiQuery } from 'zustand-api-manager'

interface User {
  id: number
  name: string
  email: string
}

// Simple API client
const api = {
  getUser: async (id: number): Promise<{ data: User }> => {
    const response = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`)
    const data = await response.json()
    return { data }
  }
}

export default function App() {
  const { data, isLoading, isError, error, query, reset } = useApiQuery<User>('user')

  useEffect(() => {
    query(() => api.getUser(1), {
      persist: true, // Cache in localStorage
      staleTime: 60_000, // Fresh for 1 minute
      retry: 2, // Retry twice on failure
      onSuccess: user => {
        console.log('User loaded:', user.name)
      }
    })
  }, [query])

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
