import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { PageLoader } from '../components/PageLoader'
import { useAuth } from './AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <PageLoader label="正在确认登录状态" />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
