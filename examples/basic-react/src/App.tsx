import React, { useState } from 'react'
import {
  ApiQueryEndpoint,
  ApiMutationEndpoint,
  createApiComposer,
  createApiStore,
  FetchStatus,
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
  new Promise<User>(resolve => {
    setTimeout(() => resolve({ id, username: 'johndoe' }), 800)
  })

const fetchPosts = () =>
  new Promise<Post[]>(resolve => {
    setTimeout(
      () =>
        resolve([
          { id: 1, title: 'Hello Zustand' },
          { id: 2, title: 'Managing API state' }
        ]),
      1200
    )
  })

const fetchComments = () =>
  new Promise<Comment[]>(resolve => {
    setTimeout(
      () =>
        resolve([
          { id: 1, body: 'Great post!' },
          { id: 2, body: 'Very useful, thanks.' }
        ]),
      1000
    )
  })

// Second store for a separate feature domain ----------------------------------

interface SecondApiStructure {
  getComments: ApiQueryEndpoint<void, Comment[]>
}

const secondStore = createApiStore({ storageKey: 'second-store' })
const useSecondApi = secondStore.createApiComposer<SecondApiStructure>({
  queries: {
    getComments: fetchComments
  }
})

// Typed API structure for the default store's composer ------------------------

interface CreatePostPayload {
  title: string
}

interface DefaultApiStructure {
  getUser: ApiQueryEndpoint<{ id: number }, User>
  getPosts: ApiQueryEndpoint<void, Post[]>
  createPost: ApiMutationEndpoint<CreatePostPayload, Post>
}

const useApi = createApiComposer<DefaultApiStructure>({
  queries: {
    getUser: (params) => fetchUser(params.id),
    getPosts: fetchPosts
  },
  mutations: {
    createPost: {
      fn: (payload) =>
        new Promise<Post>(resolve =>
          setTimeout(() => resolve({ id: Date.now(), title: payload.title }), 500)
        ),
      invalidates: ['getPosts'],
      optimistic: {
        getPosts: (vars, current) => [...(current ?? []), { id: Date.now(), title: vars.title }]
      }
    }
  }
})

// Components ------------------------------------------------------------------

/** Shows loading state for the default singleton store. */
const DefaultStoreLoading: React.FC = () => {
  const anyLoading = useLoadingStates()

  if (!anyLoading) return null

  return (
    <div style={{ ...bannerStyle, background: '#e6f4ff', borderColor: '#91caff' }}>
      <strong>Default store:</strong> Something loading...
    </div>
  )
}

/** Shows loading state for the second store. */
const SecondStoreLoading: React.FC = () => {
  const anyLoading = secondStore.useLoadingStates()

  if (!anyLoading) return null

  return (
    <div style={{ ...bannerStyle, background: '#f6ffed', borderColor: '#b7eb8f' }}>
      <strong>Second store:</strong> Comments loading...
    </div>
  )
}

/** Combined indicator -- true if ANY store has a loading request. */
const GlobalLoadingIndicator: React.FC = () => {
  const defaultLoading = useLoadingStates()
  const secondLoading = secondStore.useLoadingStates()

  if (!defaultLoading && !secondLoading) return null

  return (
    <div style={{ ...bannerStyle, background: '#fffae6', borderColor: '#ffe58f' }}>
      <strong>Global:</strong> At least one store is loading...
    </div>
  )
}

const ComposerDeclarativeExample: React.FC = () => {
  const { data: posts, isLoading, isError, status, fetchedAt, reset } =
    useApi('getPosts', { staleTime: 10000 })

  return (
    <Card title="Composer — declarative mode" hint="auto-fetch · staleTime · typed composer">
      <ButtonRow>
        <button onClick={reset} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      {isError && <div style={{ color: 'red' }}>Error loading posts</div>}
      {isLoading && <div>Loading...</div>}
      <ul>
        {posts?.map(post => (
          <li key={post.id}>{post.title}</li>
        )) ?? <li>No posts loaded</li>}
      </ul>
    </Card>
  )
}

const ComposerParamChangeExample: React.FC = () => {
  const [userId, setUserId] = useState(1)

  // Declarative mode — auto-refetches when params change
  const { data, isLoading, status, fetchedAt, reset } = useApi('getUser', {
    params: { id: userId }
  })

  return (
    <Card
      title="Composer — declarative with params"
      hint="params change triggers refetch · typed params"
    >
      <ButtonRow>
        <button onClick={() => setUserId(id => id + 1)}>
          Next user (current: {userId})
        </button>
        <button onClick={reset} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      {isLoading && <div>Loading...</div>}
      <Pre>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Pre>
    </Card>
  )
}

const ComposerImperativeExample: React.FC = () => {
  const { data, isIdle, isLoading, status, fetchedAt, query, reset } =
    useApi('getUser')

  const loadUser = async () => {
    const user = await query({ id: 42 }, { staleTime: 5000 })
    if (user) console.log('Returned user:', user.username)
  }

  return (
    <Card title="Composer — imperative mode" hint="query() on button click · staleTime · fetchedAt">
      <ButtonRow>
        <button onClick={loadUser} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Load user'}
        </button>
        <button onClick={reset} disabled={isIdle}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      <Pre>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Pre>
    </Card>
  )
}

const ComposerPollingExample: React.FC = () => {
  const [enabled, setEnabled] = useState(true)

  const { data: posts, isLoading, status, fetchedAt } = useApi('getPosts', {
    polling: 5000,
    enabled,
    staleTime: 2000
  })

  return (
    <Card title="Composer — polling" hint="polling: 5000 · enabled toggle · staleTime">
      <ButtonRow>
        <button onClick={() => setEnabled(e => !e)}>
          {enabled ? 'Pause polling' : 'Resume polling'}
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      {isLoading && <div>Loading...</div>}
      <ul>
        {posts?.map(post => (
          <li key={post.id}>{post.title}</li>
        )) ?? <li>No posts loaded</li>}
      </ul>
    </Card>
  )
}

const ComposerMutationExample: React.FC = () => {
  const { mutate, isLoading, isSuccess, data, reset } = useApi('createPost')

  const handleCreate = () => {
    mutate({ title: `Post at ${new Date().toLocaleTimeString()}` })
  }

  return (
    <Card title="Composer — mutation with invalidation" hint="createPost · invalidates getPosts · optimistic">
      <ButtonRow>
        <button onClick={handleCreate} disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Post'}
        </button>
        <button onClick={reset} disabled={!isSuccess}>
          Reset
        </button>
      </ButtonRow>
      {isSuccess && data && <Pre>{JSON.stringify(data, null, 2)}</Pre>}
    </Card>
  )
}

/** Uses the second store — completely isolated from the default store. */
const SecondStoreExample: React.FC = () => {
  const { data: comments, isLoading, status, fetchedAt, reset, invalidate } =
    useSecondApi('getComments', { staleTime: 8000 })

  return (
    <Card
      title="Composer — second store (declarative)"
      hint="isolated store · staleTime · invalidate"
      accent="#52c41a"
    >
      <ButtonRow>
        <button onClick={() => invalidate()} disabled={status === FetchStatus.IDLE}>
          Invalidate
        </button>
        <button onClick={reset} disabled={status === FetchStatus.IDLE}>
          Reset
        </button>
      </ButtonRow>
      <Status value={status} fetchedAt={fetchedAt} />
      {isLoading && <div>Loading...</div>}
      <ul>
        {comments?.map(c => (
          <li key={c.id}>{c.body}</li>
        )) ?? <li>No comments loaded</li>}
      </ul>
    </Card>
  )
}

const PrefetchExample: React.FC = () => {
  const { data, isLoading, status, fetchedAt, query } = useApi('getUser')

  const handlePrefetch = () => {
    useApi.prefetch('getUser', { id: 99 })
  }

  const handleLoad = () => {
    query({ id: 99 })
  }

  return (
    <Card title="Prefetch" hint="useApi.prefetch() static method · preload on hover">
      <ButtonRow>
        <button onMouseEnter={handlePrefetch} onClick={handleLoad} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Hover to prefetch, click to load (id=99)'}
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
          <h1 style={{ margin: 0 }}>Zustand API Manager — Composer Example</h1>
          <p style={{ marginTop: 8 }}>
            Declarative auto-fetching, polling, prefetch, mutations with invalidation,
            two isolated stores, and <code>useLoadingStates</code>.
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
        <ComposerDeclarativeExample />
        <ComposerParamChangeExample />
        <ComposerImperativeExample />
        <ComposerPollingExample />
        <ComposerMutationExample />
        <PrefetchExample />

        <h3 style={{ margin: '24px 0 12px', color: '#52c41a' }}>Second store</h3>
        <SecondStoreExample />

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
