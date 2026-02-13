import React, { useState } from 'react'
import { useApiMutation, useApiStore } from 'zustand-api-manager'

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
  login: async (credentials: LoginCredentials): Promise<{ data: AuthResponse }> => {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    })
    if (!response.ok) throw new Error('Login failed')
    const data = await response.json()
    return { data }
  }
}

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const { mutate, isLoading, error } = useApiMutation<AuthResponse, LoginCredentials>(
    'login',
    api.login
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const result = await mutate(
      { email, password },
      {
        onSuccess: auth => {
          // Store token
          localStorage.setItem('token', auth.token)
          console.log('Logged in as:', auth.user.name)
        },
        onError: err => {
          console.error('Login failed:', err.message)
        }
      }
    )

    if (result) {
      // Navigate to dashboard
      window.location.href = '/dashboard'
    }
  }

  const handleLogout = () => {
    // Clear all API state on logout
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
