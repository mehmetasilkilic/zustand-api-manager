import React from 'react'
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

const updateUser = (user: User) =>
  new Promise<{ data: User }>(resolve => {
    setTimeout(() => resolve({ data: { ...user, username: user.username + ' (saved)' } }), 1500)
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
    const user = await handleApi(() => fetchUser(7), {
      persist: true,
      staleTime: 5000,
      onSuccess: data => console.log('User loaded:', data.username)
    })
    if (user) console.log('Returned user:', user.username)
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>useApiHandler (user)</Text>
      <Text style={styles.featureHint}>
        staleTime · status · fetchedAt · resetApi · typed onSuccess
      </Text>
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
      {isError && <Text style={styles.errorText}>Error loading user</Text>}
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
      onSuccess: data => console.log('Saved user:', data.username)
    })
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Optimistic update</Text>
      <Text style={styles.featureHint}>
        Data appears instantly via optimisticData, then gets replaced by server response.
      </Text>
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
    void handleApi(() => fetchPosts(), {
      staleTime: 10000
    })
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>createApiComposer (getPosts)</Text>
      <Text style={styles.featureHint}>staleTime · resetApi · fetchedAt</Text>
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

const GlobalLoadingIndicator: React.FC = () => {
  const anyLoading = useLoadingStates()
  const userOrPostsLoading = useLoadingStates(['user', 'getPosts'])

  if (!anyLoading) return null

  return (
    <View style={styles.banner}>
      <ActivityIndicator size="small" color="#1677ff" style={{ marginRight: 8 }} />
      <Text style={styles.bannerText}>
        {userOrPostsLoading ? 'User or posts are loading…' : 'Some API is loading…'}
      </Text>
    </View>
  )
}

const App: React.FC = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Zustand API Manager – React Native Example</Text>
        <Text style={styles.subtitle}>
          Demo of <Text style={styles.code}>useApiHandler</Text>,{' '}
          <Text style={styles.code}>useLoadingStates</Text>,{' '}
          <Text style={styles.code}>createApiComposer</Text>, and new features.
        </Text>

        <GlobalLoadingIndicator />
        <BasicHandlerExample />
        <OptimisticUpdateExample />
        <ComposerExample />
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
  code: {
    fontFamily: 'Courier',
    backgroundColor: '#e6f4ff',
    paddingHorizontal: 4,
    borderRadius: 4
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#e6f4ff',
    borderColor: '#91caff',
    borderWidth: 1,
    marginBottom: 16
  },
  bannerText: {
    color: '#0958d9',
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
