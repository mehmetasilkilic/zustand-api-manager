import React, { useState } from 'react'
import {
  ApiEndpoint,
  createApiComposer,
  FetchStatus,
  useApiHandler,
  useLoadingStates
} from 'zustand-api-manager'

interface User {
  id: number
  username: string
}

interface Post {
  id: number
  title: string
}

// Simulated APIs --------------------------------------------------------------

const fetchUser = (id: number) =>
  new Promise<{ data: User }>(resolve => {
    setTimeout(() => {
      resolve({ data: { id, username: 'johndoe' } })
    }, 800)
  })

const fetchPosts = () =>
  new Promise<{ data: Post[] }>(resolve => {
    setTimeout(() => {
      resolve({
        data: [
          { id: 1, title: 'Hello Zustand' },
          { id: 2, title: 'Managing API state' }
        ]
      })
    }, 1200)
  })

const updateUser = (user: User) =>
  new Promise<{ data: User }>(resolve => {
    setTimeout(() => {
      resolve({ data: { ...user, username: user.username + ' (saved)' } })
    }, 1500)
  })

// Typed API structure for composer -------------------------------------------

interface MyApiStructure {
  getUser: ApiEndpoint<{ id: number }, User>
  getPosts: ApiEndpoint<void, Post[]>
}

const useApi = createApiComposer<MyApiStructure>()

// Components ------------------------------------------------------------------

const BasicHandlerExample: React.FC = () => {
  const { data, status, isIdle, isLoading, isError, fetchedAt, handleApi, resetApi } =
    useApiHandler<User>('user')

  const loadUser = async () => {
    // handleApi now returns the data directly
    const user = await handleApi(() => fetchUser(13), {
      persist: true,
      staleTime: 5000, // skip refetch if data is less than 5s old
      onSuccess: data => console.log('User loaded:', data.username),
      onError: () => console.error('Failed to load user')
    })
    if (user) console.log('Returned user:', user.username)
  }

  return (
    <section style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16 }}>
      <h2>Basic useApiHandler example</h2>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 12px' }}>
        Demonstrates: <code>staleTime</code>, <code>status</code>, <code>fetchedAt</code>,{' '}
        <code>resetApi</code>, and typed <code>onSuccess</code>.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={loadUser} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Load user'}
        </button>
        <button onClick={resetApi} disabled={isIdle}>
          Reset
        </button>
      </div>
      <div style={{ fontSize: 13, marginBottom: 4 }}>
        Status: <strong>{status}</strong>
        {fetchedAt && (
          <span style={{ marginLeft: 8, color: '#888' }}>
            (fetched at {new Date(fetchedAt).toLocaleTimeString()})
          </span>
        )}
      </div>
      <pre style={{ marginTop: 8 }}>
        {data ? JSON.stringify(data, null, 2) : 'No data yet'}
      </pre>
    </section>
  )
}

const OptimisticUpdateExample: React.FC = () => {
  const { data, isLoading, status, handleApi, resetApi } = useApiHandler<User>('optimistic-user')

  const saveUser = () => {
    const optimistic: User = { id: 42, username: 'optimistic-jane' }
    void handleApi(() => updateUser(optimistic), {
      optimisticData: optimistic, // show immediately while request is in-flight
      onSuccess: data => console.log('Saved user:', data.username)
    })
  }

  return (
    <section style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16 }}>
      <h2>Optimistic update example</h2>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 12px' }}>
        Data appears instantly via <code>optimisticData</code>, then gets replaced by server
        response.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={saveUser} disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Save user'}
        </button>
        <button onClick={resetApi} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </div>
      <div style={{ fontSize: 13, marginBottom: 4 }}>
        Status: <strong>{status}</strong>
      </div>
      <pre style={{ marginTop: 8 }}>
        {data ? JSON.stringify(data, null, 2) : 'No data yet'}
      </pre>
    </section>
  )
}

const ComposerExample: React.FC = () => {
  const { data: posts, isLoading, isError, status, fetchedAt, handleApi, resetApi } =
    useApi('getPosts')

  const loadPosts = () => {
    void handleApi(() => fetchPosts(), {
      staleTime: 10000 // cache for 10s
    })
  }

  return (
    <section style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16 }}>
      <h2>Typed API composer example</h2>
      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 12px' }}>
        Demonstrates: <code>createApiComposer</code> with <code>staleTime</code> and{' '}
        <code>resetApi</code>.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={loadPosts} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Load posts'}
        </button>
        <button onClick={resetApi} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </div>
      <div style={{ fontSize: 13, marginBottom: 4 }}>
        Status: <strong>{status}</strong>
        {fetchedAt && (
          <span style={{ marginLeft: 8, color: '#888' }}>
            (fetched at {new Date(fetchedAt).toLocaleTimeString()})
          </span>
        )}
      </div>
      {isError && <div style={{ color: 'red' }}>Error loading posts</div>}
      <ul>
        {posts?.map(post => (
          <li key={post.id}>{post.title}</li>
        )) ?? <li>No posts loaded</li>}
      </ul>
    </section>
  )
}

const GlobalLoadingIndicator: React.FC = () => {
  const anyLoading = useLoadingStates()
  const userOrPostsLoading = useLoadingStates(['user', 'getPosts'])

  if (!anyLoading) return null

  return (
    <div
      style={{
        padding: 8,
        marginBottom: 16,
        background: '#fffae6',
        border: '1px solid #ffe58f',
        borderRadius: 4
      }}
    >
      <strong>Global loading:</strong>{' '}
      {userOrPostsLoading ? 'User or posts are loading…' : 'Some API is loading…'}
    </div>
  )
}

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'))

  const background = theme === 'light' ? '#f5f5f5' : '#141414'
  const foreground = theme === 'light' ? '#000' : '#f5f5f5'
  const cardBg = theme === 'light' ? '#fff' : '#1f1f1f'

  return (
    <div
      style={{
        minHeight: '100vh',
        margin: 0,
        padding: 24,
        background,
        color: foreground,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      }}
    >
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>Zustand API Manager – React Example</h1>
          <p style={{ marginTop: 8 }}>
            Demo of <code>useApiHandler</code>, <code>useLoadingStates</code>,{' '}
            <code>createApiComposer</code>, and new features.
          </p>
        </div>
        <button onClick={toggleTheme}>{theme === 'light' ? 'Dark mode' : 'Light mode'}</button>
      </header>

      <main
        style={{
          maxWidth: 960,
          margin: '0 auto',
          background: cardBg,
          padding: 24,
          borderRadius: 12
        }}
      >
        <GlobalLoadingIndicator />
        <BasicHandlerExample />
        <OptimisticUpdateExample />
        <ComposerExample />
      </main>
    </div>
  )
}
