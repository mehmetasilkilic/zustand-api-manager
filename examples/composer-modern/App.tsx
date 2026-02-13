import React, { useEffect } from 'react'
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

const api = {
  getUser: async (params: { id: number }) => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return {
      data: { id: params.id, name: `User ${params.id}`, email: `user${params.id}@example.com` }
    }
  },

  listUsers: async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return {
      data: [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
        { id: 3, name: 'Bob Johnson', email: 'bob@example.com' }
      ]
    }
  },

  createUser: async (payload: CreateUserPayload) => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return {
      data: { id: Date.now(), ...payload }
    }
  },

  updateUser: async (params: { id: number; data: UpdateUserPayload }) => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return {
      data: { id: params.id, name: 'Updated User', email: 'updated@example.com', ...params.data }
    }
  },

  deleteUser: async (_params: { id: number }) => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return { data: undefined }
  }
}

// ====================
// Create Composer
// ====================

const useApi = createApiComposer<MyApi>({
  mutations: {
    createUser: api.createUser,
    updateUser: api.updateUser,
    deleteUser: api.deleteUser
  }
})

// ====================
// Components
// ====================

function UserProfile({ userId }: { userId: number }) {
  const { data, isLoading, isError, error, query, invalidate } = useApi('getUser')

  useEffect(() => {
    query({ id: userId }, api.getUser, {
      staleTime: 60_000 // Cache for 1 minute
    })
  }, [userId, query])

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
      <h3>User Profile (Query Endpoint)</h3>
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
  const { data, isLoading, query } = useApi('listUsers')

  useEffect(() => {
    query(api.listUsers)
  }, [query])

  if (isLoading) return <div>Loading users...</div>

  return (
    <div
      style={{
        padding: '16px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        marginBottom: '16px'
      }}
    >
      <h3>User List (Query Endpoint)</h3>
      <ul>
        {data?.map(user => (
          <li key={user.id}>
            {user.name} ({user.email})
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
        border: '1px solid #ccc',
        borderRadius: '8px',
        marginBottom: '16px'
      }}
    >
      <h3>Create User (Mutation Endpoint)</h3>

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
      <h3>Update User (Mutation Endpoint)</h3>

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

function DeleteUserButton({ userId }: { userId: number }) {
  const { mutate, isLoading, isSuccess, reset } = useApi('deleteUser')

  const handleDelete = async () => {
    if (!confirm(`Delete user ${userId}?`)) return

    await mutate(
      { id: userId },
      {
        onSuccess: () => {
          console.log('User deleted')
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
      <h3>Delete User (Mutation Endpoint)</h3>
      <button onClick={handleDelete} disabled={isLoading}>
        {isLoading ? 'Deleting...' : `Delete User ${userId}`}
      </button>
      {isSuccess && <span style={{ color: 'red', marginLeft: '8px' }}>Deleted!</span>}
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
        This example demonstrates using <code>createApiComposer</code> with both query and mutation
        endpoints.
      </p>

      <hr style={{ margin: '24px 0' }} />

      <h2>Queries (Read Operations)</h2>
      <UserProfile userId={1} />
      <UserList />

      <hr style={{ margin: '24px 0' }} />

      <h2>Mutations (Write Operations)</h2>
      <CreateUserForm />
      <UpdateUserForm />
      <DeleteUserButton userId={1} />

      <hr style={{ margin: '24px 0' }} />

      <div style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Key Differences:</h3>
        <ul>
          <li>
            <strong>Query endpoints</strong> use <code>ApiQueryEndpoint</code> and return{' '}
            <code>query</code>,<code>reset</code>, <code>invalidate</code>, and{' '}
            <code>fetchedAt</code>
          </li>
          <li>
            <strong>Mutation endpoints</strong> use <code>ApiMutationEndpoint</code> and return{' '}
            <code>mutate</code>
            and <code>reset</code> (no invalidate or fetchedAt)
          </li>
          <li>
            Mutation functions are bound at composer creation time via the <code>mutations</code>{' '}
            config
          </li>
          <li>
            Query functions are passed at call time via <code>query</code>
          </li>
        </ul>
      </div>
    </div>
  )
}
