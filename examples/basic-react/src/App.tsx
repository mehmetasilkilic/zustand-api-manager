import React, { useState } from 'react'
import {
  ApiEndpoint,
  createApiComposer,
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

// Typed API structure for composer -------------------------------------------

interface MyApiStructure {
  getUser: ApiEndpoint<{ id: number }, User>
  getPosts: ApiEndpoint<void, Post[]>
}

const useApi = createApiComposer<MyApiStructure>()

// Components ------------------------------------------------------------------

const BasicHandlerExample: React.FC = () => {
  const { data, isIdle, isLoading, isError, handleApi } = useApiHandler<User>('user')

  const loadUser = () => {
    void handleApi(() => fetchUser(13), {
      persist: true,
      onSuccess: () => console.log('User loaded'),
      onError: () => console.error('Failed to load user')
    })
  }

  return (
    <section style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16 }}>
      <h2>Basic useApiHandler example</h2>
      <button onClick={loadUser} disabled={isLoading} style={{ marginBottom: 8 }}>
        {isLoading ? 'Loading…' : 'Load user'}
      </button>
      <div>
        {isIdle && <span>Status: idle</span>}
        {isLoading && <span>Status: loading</span>}
        {isError && <span>Status: error</span>}
        {!isIdle && !isLoading && !isError && <span>Status: success</span>}
      </div>
      <pre style={{ marginTop: 8 }}>
        {data ? JSON.stringify(data, null, 2) : 'No data yet'}
      </pre>
    </section>
  )
}

const ComposerExample: React.FC = () => {
  const { data: posts, isLoading, isError, handleApi } = useApi('getPosts')

  const loadPosts = () => {
    void handleApi(() => fetchPosts())
  }

  return (
    <section style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16 }}>
      <h2>Typed API composer example</h2>
      <button onClick={loadPosts} disabled={isLoading} style={{ marginBottom: 8 }}>
        {isLoading ? 'Loading…' : 'Load posts'}
      </button>
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
            Demo of <code>useApiHandler</code>, <code>useLoadingStates</code> and{' '}
            <code>createApiComposer</code>.
          </p>
        </div>
        <button onClick={toggleTheme}>{theme === 'light' ? 'Dark mode' : 'Light mode'}</button>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', background: cardBg, padding: 24, borderRadius: 12 }}>
        <GlobalLoadingIndicator />
        <BasicHandlerExample />
        <ComposerExample />
      </main>
    </div>
  )
}


