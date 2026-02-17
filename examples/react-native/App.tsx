import React, { useState } from 'react'
import {
  ActivityIndicator,
  Button,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native'
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
    setTimeout(() => resolve({ id, username: 'mobile-user' }), 800)
  })

const fetchPosts = () =>
  new Promise<Post[]>(resolve => {
    setTimeout(
      () =>
        resolve([
          { id: 1, title: 'Hello from React Native' },
          { id: 2, title: 'Zustand API Manager in RN' }
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

// Second store ----------------------------------------------------------------

interface SecondApiStructure {
  getComments: ApiQueryEndpoint<void, Comment[]>
}

const secondStore = createApiStore({ storageKey: 'second-store' })
const useSecondApi = secondStore.createApiComposer<SecondApiStructure>({
  queries: {
    getComments: fetchComments
  }
})

// Default store composer ------------------------------------------------------

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

const GlobalLoadingIndicator: React.FC = () => {
  const defaultLoading = useLoadingStates()
  const secondLoading = secondStore.useLoadingStates()

  if (!defaultLoading && !secondLoading) return null

  return (
    <View style={styles.banner}>
      <ActivityIndicator size="small" color="#faad14" style={{ marginRight: 8 }} />
      <Text style={styles.bannerTextGlobal}>At least one store is loading...</Text>
    </View>
  )
}

const DefaultStoreLoading: React.FC = () => {
  const anyLoading = useLoadingStates()

  if (!anyLoading) return null

  return (
    <View style={[styles.banner, { backgroundColor: '#e6f4ff', borderColor: '#91caff' }]}>
      <ActivityIndicator size="small" color="#1677ff" style={{ marginRight: 8 }} />
      <Text style={[styles.bannerTextGlobal, { color: '#0958d9' }]}>Default store loading...</Text>
    </View>
  )
}

const SecondStoreLoading: React.FC = () => {
  const anyLoading = secondStore.useLoadingStates()

  if (!anyLoading) return null

  return (
    <View style={[styles.banner, { backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }]}>
      <ActivityIndicator size="small" color="#52c41a" style={{ marginRight: 8 }} />
      <Text style={[styles.bannerTextGlobal, { color: '#389e0d' }]}>Second store loading...</Text>
    </View>
  )
}

const ComposerDeclarativeExample: React.FC = () => {
  const { data: posts, isLoading, isError, status, fetchedAt, reset } =
    useApi('getPosts', { staleTime: 10000 })

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Composer — declarative mode</Text>
      <Text style={styles.featureHint}>auto-fetch · staleTime · typed composer</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title="Reset"
            onPress={reset}
            disabled={status === FetchStatus.IDLE}
            color="#999"
          />
        </View>
      </View>
      <Text style={styles.statusText}>
        Status: {status}
        {fetchedAt ? `  (fetched at ${new Date(fetchedAt).toLocaleTimeString()})` : ''}
      </Text>
      {isError && <Text style={styles.errorText}>Error loading posts</Text>}
      {isLoading && <ActivityIndicator size="small" style={{ marginVertical: 4 }} />}
      {posts?.map(post => (
        <Text key={post.id} style={styles.listItem}>
          * {post.title}
        </Text>
      )) ?? <Text style={styles.listItem}>No posts loaded</Text>}
    </View>
  )
}

const ComposerParamChangeExample: React.FC = () => {
  const [userId, setUserId] = useState(1)

  const { data, isLoading, status, fetchedAt, reset } = useApi('getUser', {
    params: { id: userId }
  })

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Composer — declarative with params</Text>
      <Text style={styles.featureHint}>params change triggers refetch · typed params</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title={`Next user (current: ${userId})`}
            onPress={() => setUserId(id => id + 1)}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Reset"
            onPress={reset}
            disabled={status === FetchStatus.IDLE}
            color="#999"
          />
        </View>
      </View>
      <Text style={styles.statusText}>
        Status: {status}
        {fetchedAt ? `  (fetched at ${new Date(fetchedAt).toLocaleTimeString()})` : ''}
      </Text>
      {isLoading && <ActivityIndicator size="small" style={{ marginVertical: 4 }} />}
      <Text style={styles.mono}>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Text>
    </View>
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
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Composer — imperative mode</Text>
      <Text style={styles.featureHint}>query() on button press · staleTime · fetchedAt</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title={isLoading ? 'Loading...' : 'Load user'}
            onPress={loadUser}
            disabled={isLoading}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="Reset" onPress={reset} disabled={isIdle} color="#999" />
        </View>
      </View>
      <Text style={styles.statusText}>
        Status: {status}
        {fetchedAt ? `  (fetched at ${new Date(fetchedAt).toLocaleTimeString()})` : ''}
      </Text>
      <Text style={styles.mono}>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Text>
    </View>
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
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Composer — polling</Text>
      <Text style={styles.featureHint}>polling: 5000 · enabled toggle · staleTime</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title={enabled ? 'Pause polling' : 'Resume polling'}
            onPress={() => setEnabled(e => !e)}
          />
        </View>
      </View>
      <Text style={styles.statusText}>
        Status: {status}
        {fetchedAt ? `  (fetched at ${new Date(fetchedAt).toLocaleTimeString()})` : ''}
      </Text>
      {isLoading && <ActivityIndicator size="small" style={{ marginVertical: 4 }} />}
      {posts?.map(post => (
        <Text key={post.id} style={styles.listItem}>
          * {post.title}
        </Text>
      )) ?? <Text style={styles.listItem}>No posts loaded</Text>}
    </View>
  )
}

const ComposerMutationExample: React.FC = () => {
  const { mutate, isLoading, isSuccess, data, reset } = useApi('createPost')

  const handleCreate = () => {
    mutate({ title: `Post at ${new Date().toLocaleTimeString()}` })
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Composer — mutation with invalidation</Text>
      <Text style={styles.featureHint}>createPost · invalidates getPosts · optimistic</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title={isLoading ? 'Creating...' : 'Create Post'}
            onPress={handleCreate}
            disabled={isLoading}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="Reset" onPress={reset} disabled={!isSuccess} color="#999" />
        </View>
      </View>
      {isSuccess && data && (
        <Text style={styles.mono}>{JSON.stringify(data, null, 2)}</Text>
      )}
    </View>
  )
}

const SecondStoreExample: React.FC = () => {
  const {
    data: comments,
    isLoading,
    status,
    fetchedAt,
    reset,
    invalidate
  } = useSecondApi('getComments', { staleTime: 8000 })

  return (
    <View style={[styles.card, { borderColor: '#b7eb8f', borderWidth: 1 }]}>
      <Text style={styles.cardTitle}>Composer — second store (declarative)</Text>
      <Text style={styles.featureHint}>isolated store · staleTime · invalidate</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title="Invalidate"
            onPress={() => invalidate()}
            disabled={status === FetchStatus.IDLE}
            color="#52c41a"
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Reset"
            onPress={reset}
            disabled={status === FetchStatus.IDLE}
            color="#999"
          />
        </View>
      </View>
      <Text style={styles.statusText}>
        Status: {status}
        {fetchedAt ? `  (fetched at ${new Date(fetchedAt).toLocaleTimeString()})` : ''}
      </Text>
      {isLoading && <ActivityIndicator size="small" style={{ marginVertical: 4 }} />}
      {comments?.map(c => (
        <Text key={c.id} style={styles.listItem}>
          * {c.body}
        </Text>
      )) ?? <Text style={styles.listItem}>No comments loaded</Text>}
    </View>
  )
}

const ResetAllExample: React.FC = () => {
  const resetDefault = () => useApiStore.getState().resetAll()
  const resetSecond = () => secondStore.useStore.getState().resetAll()
  const invalidateDefault = () => useApiStore.getState().invalidateAll()
  const invalidateSecond = () => secondStore.useStore.getState().invalidateAll()

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Bulk operations</Text>
      <Text style={styles.featureHint}>resetAll · invalidateAll — across both stores</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button title="Reset default" onPress={resetDefault} />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="Invalidate default" onPress={invalidateDefault} />
        </View>
      </View>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button title="Reset second" onPress={resetSecond} color="#52c41a" />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="Invalidate second" onPress={invalidateSecond} color="#52c41a" />
        </View>
      </View>
    </View>
  )
}

const App: React.FC = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Zustand API Manager — Composer Example</Text>
        <Text style={styles.subtitle}>
          Declarative auto-fetching, polling, mutations with invalidation,
          two isolated stores proving store isolation.
        </Text>

        <GlobalLoadingIndicator />
        <DefaultStoreLoading />
        <SecondStoreLoading />

        <Text style={styles.sectionTitle}>Default store</Text>
        <ComposerDeclarativeExample />
        <ComposerParamChangeExample />
        <ComposerImperativeExample />
        <ComposerPollingExample />
        <ComposerMutationExample />

        <Text style={[styles.sectionTitle, { color: '#52c41a' }]}>Second store</Text>
        <SecondStoreExample />

        <Text style={styles.sectionTitle}>Bulk operations</Text>
        <ResetAllExample />
      </ScrollView>
    </SafeAreaView>
  )
}

export default App

// Styles ----------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  container: {
    padding: 16,
    paddingBottom: 32
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1677ff',
    marginTop: 16,
    marginBottom: 8
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fffae6',
    borderColor: '#ffe58f',
    borderWidth: 1,
    marginBottom: 8
  },
  bannerTextGlobal: {
    color: '#d48806',
    fontSize: 14
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2
  },
  featureHint: {
    fontSize: 11,
    color: '#999',
    marginBottom: 10
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  buttonWrapper: {
    flex: 0
  },
  statusText: {
    marginTop: 4,
    marginBottom: 4,
    fontSize: 13,
    color: '#555'
  },
  errorText: {
    color: '#d4380d',
    marginBottom: 4
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: '#333',
    marginTop: 8
  },
  listItem: {
    marginTop: 4,
    fontSize: 14
  }
})
