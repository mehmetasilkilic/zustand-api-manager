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
  createApiComposer,
  createApiStore,
  FetchStatus,
  useApiQuery,
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
    setTimeout(() => resolve({ data: { id, username: 'mobile-user' } }), 800)
  })

const fetchPosts = () =>
  new Promise<{ data: Post[] }>(resolve => {
    setTimeout(
      () =>
        resolve({
          data: [
            { id: 1, title: 'Hello from React Native' },
            { id: 2, title: 'Zustand API Manager in RN' }
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

interface DefaultApiStructure {
  getUser: ApiQueryEndpoint<{ id: number }, User>
  getPosts: ApiQueryEndpoint<void, Post[]>
}

const useApi = createApiComposer<DefaultApiStructure>({
  queries: {
    getUser: (params) => fetchUser(params.id),
    getPosts: fetchPosts
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

const DeclarativeExample: React.FC = () => {
  // Declarative mode — auto-fetches on mount
  const { data, status, isLoading, fetchedAt, reset } = useApiQuery<User>('user', {
    queryFn: () => fetchUser(7),
    persist: true,
    staleTime: 5000,
    onSuccess: d => console.log('User loaded:', d.username)
  })

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>useApiQuery — declarative mode</Text>
      <Text style={styles.featureHint}>queryFn · staleTime · persist · auto-fetch on mount</Text>
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
      {isLoading && <ActivityIndicator size="small" style={{ marginVertical: 4 }} />}
      <Text style={styles.mono}>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Text>
    </View>
  )
}

const ImperativeExample: React.FC = () => {
  const { data, isIdle, isLoading, status, fetchedAt, query, reset } =
    useApiQuery<User>('imperative-user')

  const loadUser = async () => {
    const user = await query(() => fetchUser(42), { staleTime: 5000 })
    if (user) console.log('Returned user:', user.username)
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>useApiQuery — imperative mode</Text>
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

const DeclarativeKeyChangeExample: React.FC = () => {
  const [userId, setUserId] = useState(1)

  // Declarative mode — auto-refetches when key changes
  const { data, isLoading, status, fetchedAt, reset } = useApiQuery<User>(`user-${userId}`, {
    queryFn: () => fetchUser(userId),
    staleTime: 5000
  })

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Declarative with key change</Text>
      <Text style={styles.featureHint}>queryFn · key changes trigger refetch · staleTime</Text>
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

const OptimisticUpdateExample: React.FC = () => {
  const { data, isLoading, status, query, reset } = useApiQuery<User>('optimistic-user')

  const saveUser = () => {
    const optimistic: User = { id: 42, username: 'optimistic-jane' }
    void query(() => updateUser(optimistic), {
      optimisticData: optimistic,
      onSuccess: d => console.log('Saved user:', d.username)
    })
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Optimistic update — default store</Text>
      <Text style={styles.featureHint}>optimisticData · onSuccess</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title={isLoading ? 'Saving...' : 'Save user'}
            onPress={saveUser}
            disabled={isLoading}
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
      <Text style={styles.statusText}>Status: {status}</Text>
      <Text style={styles.mono}>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Text>
    </View>
  )
}

const ComposerDeclarativeExample: React.FC = () => {
  // Declarative mode — auto-fetches on mount
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

  // Declarative mode — auto-refetches when params change
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

/** Uses the second store — completely isolated from the default store. */
const SecondStoreExample: React.FC = () => {
  // Declarative mode on second store's composer
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

const SecondStoreHandlerExample: React.FC = () => {
  const { data, isLoading, status, fetchedAt, query, reset } = secondStore.useApiQuery<User>('user')

  const loadUser = async () => {
    const user = await query(() => fetchUser(99), { staleTime: 5000 })
    if (user) console.log('[Second store] user:', user.username)
  }

  return (
    <View style={[styles.card, { borderColor: '#b7eb8f', borderWidth: 1 }]}>
      <Text style={styles.cardTitle}>useApiQuery — second store (same 'user' key)</Text>
      <Text style={styles.featureHint}>same key name as default store — proves isolation</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title={isLoading ? 'Loading...' : 'Load user (id=99)'}
            onPress={loadUser}
            disabled={isLoading}
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
      <Text style={styles.mono}>{data ? JSON.stringify(data, null, 2) : 'No data yet'}</Text>
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
        <Text style={styles.title}>Zustand API Manager — Multi-Store</Text>
        <Text style={styles.subtitle}>
          Declarative auto-fetching, two isolated stores, and the same "user" key proving store
          isolation.
        </Text>

        <GlobalLoadingIndicator />
        <DefaultStoreLoading />
        <SecondStoreLoading />

        <Text style={styles.sectionTitle}>Default store</Text>
        <DeclarativeExample />
        <ImperativeExample />
        <DeclarativeKeyChangeExample />
        <OptimisticUpdateExample />
        <ComposerDeclarativeExample />
        <ComposerParamChangeExample />

        <Text style={[styles.sectionTitle, { color: '#52c41a' }]}>Second store</Text>
        <SecondStoreExample />
        <SecondStoreHandlerExample />

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
