import React, { useEffect, useState } from 'react'
import {
  ApiEndpoint,
  createApiComposer,
  createApiStore,
  FetchStatus,
  useApiHandler,
  useApiStore,
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

interface Comment {
  id: number
  body: string
}

// Simulated APIs --------------------------------------------------------------

const fetchUser = (id: number) =>
  new Promise<{ data: User }>(resolve => {
    setTimeout(() => resolve({ data: { id, username: 'johndoe' } }), 800)
  })

const fetchPosts = () =>
  new Promise<{ data: Post[] }>(resolve => {
    setTimeout(
      () =>
        resolve({
          data: [
            { id: 1, title: 'Hello Zustand' },
            { id: 2, title: 'Managing API state' }
          ]
        }),
      1200
    )
  })

const fetchComments = () =>
  new Promise<{ data: Comment[] }>(resolve => {
    setTimeout(
      () =>
        resolve({
          data: [
            { id: 1, body: 'Great post!' },
            { id: 2, body: 'Very useful, thanks.' }
          ]
        }),
      1000
    )
  })

const updateUser = (user: User) =>
  new Promise<{ data: User }>(resolve => {
    setTimeout(() => resolve({ data: { ...user, username: user.username + ' (saved)' } }), 1500)
  })

// Second store for a separate feature domain ----------------------------------

interface SecondApiStructure {
  getComments: ApiEndpoint<void, Comment[]>
}

const secondStore = createApiStore({ storageKey: 'second-store' })
const useSecondApi = secondStore.createApiComposer<SecondApiStructure>()

// Typed API structure for the default store's composer ------------------------

interface DefaultApiStructure {
  getUser: ApiEndpoint<{ id: number }, User>
  getPosts: ApiEndpoint<void, Post[]>
}

const useApi = createApiComposer<DefaultApiStructure>()

// Components ------------------------------------------------------------------

/** Shows loading state for the default singleton store. */
const DefaultStoreLoading: React.FC = () => {
  const anyLoading = useLoadingStates()
  const userOrPostsLoading = useLoadingStates(['user', 'getPosts'])

  if (!anyLoading) return null

  return (
    <div style={{ ...bannerStyle, background: '#e6f4ff', borderColor: '#91caff' }}>
      <strong>Default store:</strong>{' '}
      {userOrPostsLoading ? 'User or posts loading…' : 'Something loading…'}
    </div>
  )
}

/** Shows loading state for the second store. */
const SecondStoreLoading: React.FC = () => {
  const anyLoading = secondStore.useLoadingStates()

  if (!anyLoading) return null

  return (
    <div style={{ ...bannerStyle, background: '#f6ffed', borderColor: '#b7eb8f' }}>
      <strong>Second store:</strong> Comments loading…
    </div>
  )
}

/** Combined indicator — true if ANY store has a loading request. */
const GlobalLoadingIndicator: React.FC = () => {
  const defaultLoading = useLoadingStates()
  const secondLoading = secondStore.useLoadingStates()

  if (!defaultLoading && !secondLoading) return null

  return (
    <div style={{ ...bannerStyle, background: '#fffae6', borderColor: '#ffe58f' }}>
      <strong>Global:</strong> At least one store is loading…
    </div>
  )
}

const BasicHandlerExample: React.FC = () => {
  const { data, status, isIdle, isLoading, fetchedAt, handleApi, resetApi } =
    useApiHandler<User>('user')

  const loadUser = async () => {
    const user = await handleApi(() => fetchUser(13), {
      persist: true,
      staleTime: 5000,
      onSuccess: d => console.log('User loaded:', d.username),
      onError: () => console.error('Failed to load user')
    })
    if (user) console.log('Returned user:', user.username)
  }

  return (
    <Card title="useApiHandler — default store" hint="staleTime · persist · fetchedAt · resetApi">
      <ButtonRow>
        <button onClick={loadUser} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Load user'}
        </button>
        <button onClick={resetApi} disabled={isIdle}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      <Pre>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Pre>
    </Card>
  )
}

const UseEffectExample: React.FC = () => {
  const [userId, setUserId] = useState(1)
  const { data, isLoading, status, fetchedAt, handleApi, resetApi } =
    useApiHandler<User>('effect-user')

  // handleApi is a stable reference — safe to include in useEffect deps.
  // This effect only re-runs when userId changes, not on every render.
  useEffect(() => {
    handleApi(() => fetchUser(userId), { staleTime: 5000 })
  }, [userId, handleApi])

  return (
    <Card
      title="useEffect with handleApi — stable refs"
      hint="handleApi in useEffect deps · staleTime · no infinite loops"
    >
      <ButtonRow>
        <button onClick={() => setUserId(id => id + 1)}>
          Next user (current: {userId})
        </button>
        <button onClick={resetApi} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      {isLoading && <div>Loading…</div>}
      <Pre>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Pre>
    </Card>
  )
}

const OptimisticUpdateExample: React.FC = () => {
  const { data, isLoading, status, handleApi, resetApi } = useApiHandler<User>('optimistic-user')

  const saveUser = () => {
    const optimistic: User = { id: 42, username: 'optimistic-jane' }
    void handleApi(() => updateUser(optimistic), {
      optimisticData: optimistic,
      onSuccess: d => console.log('Saved user:', d.username)
    })
  }

  return (
    <Card title="Optimistic update — default store" hint="optimisticData · onSuccess">
      <ButtonRow>
        <button onClick={saveUser} disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Save user'}
        </button>
        <button onClick={resetApi} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} />
      <Pre>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Pre>
    </Card>
  )
}

const ComposerExample: React.FC = () => {
  const { data: posts, isLoading, isError, status, fetchedAt, handleApi, resetApi } =
    useApi('getPosts')

  const loadPosts = () => {
    void handleApi(() => fetchPosts(), { staleTime: 10000 })
  }

  return (
    <Card title="createApiComposer — default store" hint="staleTime · typed composer · resetApi">
      <ButtonRow>
        <button onClick={loadPosts} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Load posts'}
        </button>
        <button onClick={resetApi} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      {isError && <div style={{ color: 'red' }}>Error loading posts</div>}
      <ul>
        {posts?.map(post => (
          <li key={post.id}>{post.title}</li>
        )) ?? <li>No posts loaded</li>}
      </ul>
    </Card>
  )
}

const ComposerEffectExample: React.FC = () => {
  const [postId, setPostId] = useState(1)
  const { data, isLoading, status, fetchedAt, handleApi, resetApi } = useApi('getUser')

  // Composer's handleApi is also a stable ref — safe in deps
  useEffect(() => {
    handleApi({ id: postId }, params => fetchUser(params.id))
  }, [postId, handleApi])

  return (
    <Card
      title="Composer + useEffect — stable refs"
      hint="typed params · handleApi in useEffect deps · no infinite loops"
    >
      <ButtonRow>
        <button onClick={() => setPostId(id => id + 1)}>
          Next user (current: {postId})
        </button>
        <button onClick={resetApi} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      {isLoading && <div>Loading…</div>}
      <Pre>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Pre>
    </Card>
  )
}

/** Uses the second store — completely isolated from the default store. */
const SecondStoreExample: React.FC = () => {
  const { data: comments, isLoading, status, fetchedAt, handleApi, resetApi, invalidateApi } =
    useSecondApi('getComments')

  const loadComments = () => {
    void handleApi(() => fetchComments(), { staleTime: 8000 })
  }

  return (
    <Card
      title="createApiComposer — second store"
      hint="isolated store · staleTime · invalidateApi"
      accent="#52c41a"
    >
      <ButtonRow>
        <button onClick={loadComments} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Load comments'}
        </button>
        <button onClick={() => invalidateApi()} disabled={status === FetchStatus.IDLE}>
          Invalidate
        </button>
        <button onClick={resetApi} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      <ul>
        {comments?.map(c => (
          <li key={c.id}>{c.body}</li>
        )) ?? <li>No comments loaded</li>}
      </ul>
    </Card>
  )
}

/** Uses the second store with useApiHandler (bound version). */
const SecondStoreHandlerExample: React.FC = () => {
  const { data, isLoading, status, fetchedAt, handleApi, resetApi } =
    secondStore.useApiHandler<User>('user')

  const loadUser = async () => {
    const user = await handleApi(() => fetchUser(99), { staleTime: 5000 })
    if (user) console.log('[Second store] user:', user.username)
  }

  return (
    <Card
      title="useApiHandler — second store (same 'user' key)"
      hint="same key name as default store — proves isolation"
      accent="#52c41a"
    >
      <ButtonRow>
        <button onClick={loadUser} disabled={isLoading}>
          {isLoading ? 'Loading…' : 'Load user (id=99)'}
        </button>
        <button onClick={resetApi} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      <Pre>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Pre>
    </Card>
  )
}

const ResetAllExample: React.FC = () => {
  const resetDefault = () => useApiStore.getState().resetAll()
  const resetSecond = () => secondStore.useStore.getState().resetAll()
  const invalidateDefault = () => useApiStore.getState().invalidateAll()
  const invalidateSecond = () => secondStore.useStore.getState().invalidateAll()

  return (
    <Card title="Bulk operations" hint="resetAll · invalidateAll — across both stores">
      <ButtonRow>
        <button onClick={resetDefault}>Reset default store</button>
        <button onClick={invalidateDefault}>Invalidate default store</button>
      </ButtonRow>
      <ButtonRow>
        <button onClick={resetSecond} style={{ background: '#f6ffed' }}>
          Reset second store
        </button>
        <button onClick={invalidateSecond} style={{ background: '#f6ffed' }}>
          Invalidate second store
        </button>
      </ButtonRow>
    </Card>
  )
}

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const background = theme === 'light' ? '#f5f5f5' : '#141414'
  const foreground = theme === 'light' ? '#000' : '#f5f5f5'
  const cardBg = theme === 'light' ? '#fff' : '#1f1f1f'

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 24,
        background,
        color: foreground,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      }}
    >
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>Zustand API Manager — Multi-Store Example</h1>
          <p style={{ marginTop: 8 }}>
            Two isolated stores, stable <code>handleApi</code> refs in <code>useEffect</code>,{' '}
            <code>useLoadingStates</code>, and <code>createApiComposer</code>. Both stores use the{' '}
            <code>&quot;user&quot;</code> key to prove store isolation.
          </p>
        </div>
        <button onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}>
          {theme === 'light' ? 'Dark mode' : 'Light mode'}
        </button>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', background: cardBg, padding: 24, borderRadius: 12 }}>
        <GlobalLoadingIndicator />
        <DefaultStoreLoading />
        <SecondStoreLoading />

        <h3 style={{ margin: '0 0 12px', color: '#1677ff' }}>Default store</h3>
        <BasicHandlerExample />
        <UseEffectExample />
        <OptimisticUpdateExample />
        <ComposerExample />
        <ComposerEffectExample />

        <h3 style={{ margin: '24px 0 12px', color: '#52c41a' }}>Second store</h3>
        <SecondStoreExample />
        <SecondStoreHandlerExample />

        <h3 style={{ margin: '24px 0 12px' }}>Bulk operations</h3>
        <ResetAllExample />
      </main>
    </div>
  )
}

// Shared UI helpers -----------------------------------------------------------

const bannerStyle: React.CSSProperties = {
  padding: 8,
  marginBottom: 8,
  borderRadius: 4,
  border: '1px solid'
}

const Card: React.FC<{
  title: string
  hint: string
  accent?: string
  children: React.ReactNode
}> = ({ title, hint, accent, children }) => (
  <section
    style={{
      padding: 16,
      border: `1px solid ${accent ?? '#ddd'}`,
      borderRadius: 8,
      marginBottom: 16
    }}
  >
    <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
    <p style={{ fontSize: 12, color: '#888', margin: '4px 0 12px' }}>{hint}</p>
    {children}
  </section>
)

const ButtonRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>{children}</div>
)

const Status: React.FC<{ value: string; fetchedAt?: number | null }> = ({ value, fetchedAt }) => (
  <div style={{ fontSize: 13, marginBottom: 4 }}>
    Status: <strong>{value}</strong>
    {fetchedAt && (
      <span style={{ marginLeft: 8, color: '#888' }}>
        (fetched at {new Date(fetchedAt).toLocaleTimeString()})
      </span>
    )}
  </div>
)

const Pre: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <pre style={{ marginTop: 8, fontSize: 13 }}>{children}</pre>
)
