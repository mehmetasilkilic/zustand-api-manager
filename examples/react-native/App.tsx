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
    void handleApi(() => fetchUser(7), {
      persist: true
    })
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>useApiHandler (user)</Text>
      <Button title={isLoading ? 'Loading…' : 'Load user'} onPress={loadUser} disabled={isLoading} />
      <Text style={styles.statusText}>
        {isIdle && 'Status: idle'}
        {isLoading && 'Status: loading'}
        {isError && 'Status: error'}
        {!isIdle && !isLoading && !isError && 'Status: success'}
      </Text>
      <Text style={styles.mono}>
        {data ? JSON.stringify(data, null, 2) : 'No data yet'}
      </Text>
    </View>
  )
}

const ComposerExample: React.FC = () => {
  const { data: posts, isLoading, isError, handleApi } = useApi('getPosts')

  const loadPosts = () => {
    void handleApi(() => fetchPosts())
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>createApiComposer (getPosts)</Text>
      <Button title={isLoading ? 'Loading…' : 'Load posts'} onPress={loadPosts} disabled={isLoading} />
      {isError && <Text style={[styles.statusText, styles.errorText]}>Error loading posts</Text>}
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
          <Text style={styles.code}>useLoadingStates</Text> and{' '}
          <Text style={styles.code}>createApiComposer</Text>.
        </Text>

        <GlobalLoadingIndicator />
        <BasicHandlerExample />
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
    marginBottom: 8
  },
  statusText: {
    marginTop: 8,
    marginBottom: 4,
    color: '#555'
  },
  errorText: {
    color: '#d4380d'
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


