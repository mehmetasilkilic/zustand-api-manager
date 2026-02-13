import React, { useState } from 'react'
import { usePolling } from 'zustand-api-manager'

// Note: usePolling is built on top of useApiQuery and handles the query lifecycle automatically

interface Notification {
  id: number
  message: string
  read: boolean
  createdAt: string
}

const api = {
  getNotifications: async (): Promise<{ data: Notification[] }> => {
    const response = await fetch('/api/notifications')
    const data = await response.json()
    return { data }
  }
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)

  // Poll every 10 seconds when dropdown is closed
  // Stop polling when dropdown is open to avoid updates while reading
  const { data, isLoading } = usePolling<Notification[]>(
    'notifications',
    api.getNotifications,
    10_000, // Poll every 10 seconds
    {
      immediate: true, // Fetch immediately on mount
      enabled: !isOpen, // Only poll when dropdown is closed
      staleTime: 5_000, // Consider fresh for 5 seconds
      onSuccess: notifications => {
        const unreadCount = notifications.filter(n => !n.read).length
        if (unreadCount > 0) {
          document.title = `(${unreadCount}) App`
        }
      }
    }
  )

  const unreadCount = data?.filter(n => !n.read).length || 0

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setIsOpen(!isOpen)} style={{ position: 'relative' }}>
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -5,
              right: -5,
              background: 'red',
              color: 'white',
              borderRadius: '50%',
              padding: '2px 6px',
              fontSize: '12px'
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: 4,
            padding: 10,
            minWidth: 300,
            maxHeight: 400,
            overflow: 'auto',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
          }}
        >
          <h3>Notifications</h3>

          {isLoading && <p>Loading...</p>}

          {data && data.length === 0 && <p>No notifications</p>}

          {data?.map(notification => (
            <div
              key={notification.id}
              style={{
                padding: 8,
                borderBottom: '1px solid #eee',
                background: notification.read ? 'white' : '#f0f8ff'
              }}
            >
              <p style={{ margin: 0, fontWeight: notification.read ? 'normal' : 'bold' }}>
                {notification.message}
              </p>
              <small style={{ color: '#666' }}>
                {new Date(notification.createdAt).toLocaleString()}
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
