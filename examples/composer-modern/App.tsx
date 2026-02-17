import React from 'react'
import { createApiComposer, ApiQueryEndpoint, ApiMutationEndpoint } from 'zustand-api-manager'

// ====================
// Types
// ====================

interface User {
  id: number
  name: string
  email: string
}

interface CreateUserPayload {
  name: string
  email: string
}

interface UpdateUserPayload {
  name?: string
  email?: string
}

// ====================
// API Structure
// ====================

interface MyApi {
  // Queries (read operations)
  getUser: ApiQueryEndpoint<{ id: number }, User>
  listUsers: ApiQueryEndpoint<void, User[]>

  // Mutations (write operations)
  createUser: ApiMutationEndpoint<CreateUserPayload, User>
  updateUser: ApiMutationEndpoint<{ id: number; data: UpdateUserPayload }, User>
  deleteUser: ApiMutationEndpoint<{ id: number }, void>
}

// ====================
// Mock API Functions
// ====================

let mockUsers: User[] = [
  { id: 1, name: 'John Doe', email: 'john@example.com' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com' }
]

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const api = {
  getUser: async (params: { id: number }): Promise<User> => {
    await delay(500)
    return (
      mockUsers.find(u => u.id === params.id) ?? {
        id: params.id,
        name: `User ${params.id}`,
        email: `user${params.id}@example.com`
      }
    )
  },

  listUsers: async (): Promise<User[]> => {
    await delay(500)
    return [...mockUsers]
  },

  createUser: async (payload: CreateUserPayload): Promise<User> => {
    await delay(800)
    const newUser = { id: Date.now(), ...payload }
    mockUsers = [...mockUsers, newUser]
    return newUser
  },

  updateUser: async (params: { id: number; data: UpdateUserPayload }): Promise<User> => {
    await delay(500)
    const updated = {
      id: params.id,
      name: params.data.name ?? 'Updated User',
      email: params.data.email ?? 'updated@example.com'
    }
    mockUsers = mockUsers.map(u => (u.id === params.id ? { ...u, ...updated } : u))
    return updated
  },

  deleteUser: async (params: { id: number }): Promise<void> => {
    await delay(500)
    mockUsers = mockUsers.filter(u => u.id !== params.id)
  }
}

// ====================
// Create Composer — with invalidation + optimistic updates
// ====================

const useApi = createApiComposer<MyApi>({
  queries: {
    getUser: api.getUser,
    listUsers: api.listUsers
  },
  mutations: {
    // createUser: invalidates listUsers + optimistic update
    createUser: {
      fn: api.createUser,
      invalidates: ['listUsers'],
      optimistic: {
        listUsers: (vars, current) => [
          ...(current ?? []),
          { id: Date.now(), name: vars.name, email: vars.email }
        ]
      }
    },
    // deleteUser: invalidates listUsers + optimistic removal
    deleteUser: {
      fn: api.deleteUser,
      invalidates: ['listUsers'],
      optimistic: {
        listUsers: (vars, current) => (current ?? []).filter(u => u.id !== vars.id)
      }
    },
    // updateUser: bare function (no invalidation)
    updateUser: api.updateUser
  }
})

// ====================
// Components
// ====================

function UserProfile({ userId }: { userId: number }) {
  // Declarative mode — auto-fetches when params change
  const { data, isLoading, isError, error, invalidate } = useApi('getUser', {
    params: { id: userId },
    staleTime: 60_000 // Cache for 1 minute
  })

  if (isLoading) return <div>Loading user...</div>
  if (isError) return <div>Error: {error?.message}</div>
  if (!data) return null

  return (
    <div
      style={{
        padding: '16px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        marginBottom: '16px'
      }}
    >
      <h3>User Profile (Declarative Query)</h3>
      <p>
        <strong>ID:</strong> {data.id}
      </p>
      <p>
        <strong>Name:</strong> {data.name}
      </p>
      <p>
        <strong>Email:</strong> {data.email}
      </p>
      <button onClick={() => invalidate()}>Refresh User</button>
    </div>
  )
}

function UserList() {
  // Declarative mode — void params, auto-fetches on mount
  // This query is automatically refetched when createUser or deleteUser succeeds
  const { data, isLoading } = useApi('listUsers', {})

  if (isLoading && !data) return <div>Loading users...</div>

  return (
    <div
      style={{
        padding: '16px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        marginBottom: '16px'
      }}
    >
      <h3>User List (Auto-Invalidated by Mutations)</h3>
      {isLoading && <div style={{ fontSize: '12px', color: '#888' }}>Refreshing...</div>}
      <ul>
        {data?.map(user => (
          <li key={user.id} style={{ marginBottom: '4px' }}>
            {user.name} ({user.email})
            <DeleteUserButton userId={user.id} userName={user.name} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function CreateUserForm() {
  const { mutate, isLoading, isSuccess, data, reset } = useApi('createUser')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    await mutate(
      { name, email },
      {
        onSuccess: user => {
          console.log('User created:', user)
          setName('')
          setEmail('')
          // Reset success state after 2 seconds
          setTimeout(() => reset(), 2000)
        },
        onError: error => {
          console.error('Failed to create user:', error)
        }
      }
    )
  }

  return (
    <div
      style={{
        padding: '16px',
        border: '1px solid #4CAF50',
        borderRadius: '8px',
        marginBottom: '16px'
      }}
    >
      <h3>Create User (Mutation with Invalidation + Optimistic)</h3>
      <p style={{ fontSize: '12px', color: '#666' }}>
        On submit: list updates optimistically, then refetches from server on success.
        On error: list rolls back to previous data.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '8px' }}>
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={{ marginRight: '8px', padding: '4px' }}
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ padding: '4px' }}
          />
        </div>

        <button type="submit" disabled={isLoading} style={{ marginRight: '8px' }}>
          {isLoading ? 'Creating...' : 'Create User'}
        </button>

        {isSuccess && data && (
          <span style={{ color: 'green' }}>
            Created: {data.name} (ID: {data.id})
          </span>
        )}
      </form>
    </div>
  )
}

function DeleteUserButton({ userId, userName }: { userId: number; userName: string }) {
  const { mutate, isLoading } = useApi('deleteUser')

  const handleDelete = async () => {
    if (!confirm(`Delete ${userName}?`)) return
    await mutate({ id: userId })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isLoading}
      style={{ marginLeft: '8px', fontSize: '12px', color: 'red', cursor: 'pointer' }}
    >
      {isLoading ? '...' : 'Delete'}
    </button>
  )
}

function UpdateUserForm() {
  const { mutate, isLoading, isSuccess, reset } = useApi('updateUser')
  const [userId, setUserId] = React.useState('1')
  const [name, setName] = React.useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    await mutate(
      {
        id: parseInt(userId),
        data: { name }
      },
      {
        onSuccess: user => {
          console.log('User updated:', user)
          setName('')
          setTimeout(() => reset(), 2000)
        }
      }
    )
  }

  return (
    <div
      style={{
        padding: '16px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        marginBottom: '16px'
      }}
    >
      <h3>Update User (Bare Function — No Auto-Invalidation)</h3>
      <p style={{ fontSize: '12px', color: '#666' }}>
        This mutation uses a bare function. No automatic invalidation.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '8px' }}>
          <input
            type="number"
            placeholder="User ID"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            required
            style={{ marginRight: '8px', padding: '4px', width: '80px' }}
          />
          <input
            type="text"
            placeholder="New Name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={{ padding: '4px' }}
          />
        </div>

        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Updating...' : 'Update User'}
        </button>

        {isSuccess && (
          <span style={{ color: 'green', marginLeft: '8px' }}>Updated successfully!</span>
        )}
      </form>
    </div>
  )
}

// ====================
// Main App
// ====================

export default function App() {
  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Modern API Composer Example</h1>
      <p>
        This example demonstrates <code>createApiComposer</code> with automatic cache invalidation
        and cross-endpoint optimistic updates.
      </p>

      <hr style={{ margin: '24px 0' }} />

      <h2>Queries (Declarative Auto-Fetch)</h2>
      <UserProfile userId={1} />
      <UserList />

      <hr style={{ margin: '24px 0' }} />

      <h2>Mutations</h2>
      <CreateUserForm />
      <UpdateUserForm />

      <hr style={{ margin: '24px 0' }} />

      <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <h3>How It Works:</h3>
        <ul>
          <li>
            <strong>createUser</strong> has <code>invalidates: ['listUsers']</code> and{' '}
            <code>optimistic</code> — the list updates instantly, then refetches from server
          </li>
          <li>
            <strong>deleteUser</strong> has <code>invalidates: ['listUsers']</code> and{' '}
            <code>optimistic</code> — the user disappears instantly, then server confirms
          </li>
          <li>
            <strong>updateUser</strong> uses a bare function — no auto-invalidation
          </li>
          <li>
            If a mutation <strong>fails</strong>, optimistic data rolls back automatically
          </li>
        </ul>
      </div>
    </div>
  )
}
