import React, { useEffect, useState } from 'react'
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
  getComments: ApiEndpoint<void, Comment[]>
}

const secondStore = createApiStore({ storageKey: 'second-store' })
const useSecondApi = secondStore.createApiComposer<SecondApiStructure>()

// Default store composer ------------------------------------------------------

interface DefaultApiStructure {
  getUser: ApiEndpoint<{ id: number }, User>
  getPosts: ApiEndpoint<void, Post[]>
}

const useApi = createApiComposer<DefaultApiStructure>()

// Components ------------------------------------------------------------------

const GlobalLoadingIndicator: React.FC = () => {
  const defaultLoading = useLoadingStates()
  const secondLoading = secondStore.useLoadingStates()

  if (!defaultLoading && !secondLoading) return null

  return (
    <View style={styles.banner}>
      <ActivityIndicator size="small" color="#faad14" style={{ marginRight: 8 }} />
      <Text style={styles.bannerTextGlobal}>At least one store is loading…</Text>
    </View>
  )
}

const DefaultStoreLoading: React.FC = () => {
  const anyLoading = useLoadingStates()

  if (!anyLoading) return null

  return (
    <View style={[styles.banner, { backgroundColor: '#e6f4ff', borderColor: '#91caff' }]}>
      <ActivityIndicator size="small" color="#1677ff" style={{ marginRight: 8 }} />
      <Text style={[styles.bannerTextGlobal, { color: '#0958d9' }]}>Default store loading…</Text>
    </View>
  )
}

const SecondStoreLoading: React.FC = () => {
  const anyLoading = secondStore.useLoadingStates()

  if (!anyLoading) return null

  return (
    <View style={[styles.banner, { backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }]}>
      <ActivityIndicator size="small" color="#52c41a" style={{ marginRight: 8 }} />
      <Text style={[styles.bannerTextGlobal, { color: '#389e0d' }]}>Second store loading…</Text>
    </View>
  )
}

const BasicHandlerExample: React.FC = () => {
  const { data, status, isIdle, isLoading, fetchedAt, handleApi, resetApi } =
    useApiHandler<User>('user')

  const loadUser = async () => {
    const user = await handleApi(() => fetchUser(7), {
      persist: true,
      staleTime: 5000,
      onSuccess: d => console.log('User loaded:', d.username)
    })
    if (user) console.log('Returned user:', user.username)
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>useApiHandler — default store</Text>
      <Text style={styles.featureHint}>staleTime · persist · fetchedAt · resetApi</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title={isLoading ? 'Loading…' : 'Load user'}
            onPress={loadUser}
            disabled={isLoading}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="Reset" onPress={resetApi} disabled={isIdle} color="#999" />
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
    <View style={styles.card}>
      <Text style={styles.cardTitle}>useEffect with handleApi — stable refs</Text>
      <Text style={styles.featureHint}>handleApi in useEffect deps · staleTime · no infinite loops</Text>
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
            onPress={resetApi}
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
  const { data, isLoading, status, handleApi, resetApi } = useApiHandler<User>('optimistic-user')

  const saveUser = () => {
    const optimistic: User = { id: 42, username: 'optimistic-jane' }
    void handleApi(() => updateUser(optimistic), {
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
            title={isLoading ? 'Saving…' : 'Save user'}
            onPress={saveUser}
            disabled={isLoading}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Reset"
            onPress={resetApi}
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

const ComposerExample: React.FC = () => {
  const { data: posts, isLoading, isError, status, fetchedAt, handleApi, resetApi } =
    useApi('getPosts')

  const loadPosts = () => {
    void handleApi(() => fetchPosts(), { staleTime: 10000 })
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>createApiComposer — default store</Text>
      <Text style={styles.featureHint}>staleTime · typed composer · resetApi</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title={isLoading ? 'Loading…' : 'Load posts'}
            onPress={loadPosts}
            disabled={isLoading}
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Reset"
            onPress={resetApi}
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
      {posts?.map(post => (
        <Text key={post.id} style={styles.listItem}>
          • {post.title}
        </Text>
      )) ?? <Text style={styles.listItem}>No posts loaded</Text>}
    </View>
  )
}

const SecondStoreExample: React.FC = () => {
  const { data: comments, isLoading, status, fetchedAt, handleApi, resetApi, invalidateApi } =
    useSecondApi('getComments')

  const loadComments = () => {
    void handleApi(() => fetchComments(), { staleTime: 8000 })
  }

  return (
    <View style={[styles.card, { borderColor: '#b7eb8f', borderWidth: 1 }]}>
      <Text style={styles.cardTitle}>createApiComposer — second store</Text>
      <Text style={styles.featureHint}>isolated store · staleTime · invalidateApi</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title={isLoading ? 'Loading…' : 'Load comments'}
            onPress={loadComments}
            disabled={isLoading}
            color="#52c41a"
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Invalidate"
            onPress={() => invalidateApi()}
            disabled={status === FetchStatus.IDLE}
            color="#52c41a"
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Reset"
            onPress={resetApi}
            disabled={status === FetchStatus.IDLE}
            color="#999"
          />
        </View>
      </View>
      <Text style={styles.statusText}>
        Status: {status}
        {fetchedAt ? `  (fetched at ${new Date(fetchedAt).toLocaleTimeString()})` : ''}
      </Text>
      {comments?.map(c => (
        <Text key={c.id} style={styles.listItem}>
          • {c.body}
        </Text>
      )) ?? <Text style={styles.listItem}>No comments loaded</Text>}
    </View>
  )
}

const SecondStoreHandlerExample: React.FC = () => {
  const { data, isLoading, status, fetchedAt, handleApi, resetApi } =
    secondStore.useApiHandler<User>('user')

  const loadUser = async () => {
    const user = await handleApi(() => fetchUser(99), { staleTime: 5000 })
    if (user) console.log('[Second store] user:', user.username)
  }

  return (
    <View style={[styles.card, { borderColor: '#b7eb8f', borderWidth: 1 }]}>
      <Text style={styles.cardTitle}>useApiHandler — second store (same 'user' key)</Text>
      <Text style={styles.featureHint}>same key name as default store — proves isolation</Text>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button
            title={isLoading ? 'Loading…' : 'Load user (id=99)'}
            onPress={loadUser}
            disabled={isLoading}
            color="#52c41a"
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            title="Reset"
            onPress={resetApi}
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
          Two isolated stores, stable handleApi refs in useEffect, and the same "user" key proving
          store isolation.
        </Text>

        <GlobalLoadingIndicator />
        <DefaultStoreLoading />
        <SecondStoreLoading />

        <Text style={styles.sectionTitle}>Default store</Text>
        <BasicHandlerExample />
        <UseEffectExample />
        <OptimisticUpdateExample />
        <ComposerExample />

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
