import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { PageLoader } from '../components/PageLoader'
import { useAuth } from '../auth/AuthContext'

export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <PageLoader label="正在进入管理台" />
  }

  if (!user?.is_staff) {
    return <Navigate to="/" replace />
  }

  return children
}
