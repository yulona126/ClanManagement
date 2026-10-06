import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { ReactNode } from 'react'

export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <p className="status status-loading">加载中…</p>
  }

  if (!user?.is_staff) {
    return <Navigate to="/" replace />
  }

  return children
}
