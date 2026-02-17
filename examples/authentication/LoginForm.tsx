import React, { useState } from 'react'
import { createApiComposer, ApiMutationEndpoint, useApiStore } from 'zustand-api-manager'

interface LoginCredentials {
  email: string
  password: string
}

interface AuthResponse {
  token: string
  user: {
    id: number
    name: string
    email: string
  }
}

const api = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    })
    if (!response.ok) throw new Error('Login failed')
    return response.json()
  }
}

interface AuthApi {
  login: ApiMutationEndpoint<LoginCredentials, AuthResponse>
}

const useApi = createApiComposer<AuthApi>({
  mutations: {
    login: (credentials) => api.login(credentials)
  }
})

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const { mutate, isLoading, error } = useApi('login')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const result = await mutate(
      { email, password },
      {
        onSuccess: auth => {
          localStorage.setItem('token', auth.token)
          console.log('Logged in as:', auth.user.name)
        },
        onError: err => {
          console.error('Login failed:', err.message)
        }
      }
    )

    if (result) {
      window.location.href = '/dashboard'
    }
  }

  const handleLogout = () => {
    useApiStore.getState().resetAll()
    localStorage.removeItem('token')
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
      />

      {error && <div style={{ color: 'red' }}>{error.message}</div>}

      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Logging in...' : 'Login'}
      </button>

      <button type="button" onClick={handleLogout}>
        Logout
      </button>
    </form>
  )
}
