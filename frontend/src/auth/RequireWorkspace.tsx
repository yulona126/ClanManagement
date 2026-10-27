import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { PageLoader } from '../components/PageLoader'
import { useWorkspace } from '../features/workspaces/WorkspaceContext'

/** Requires an explicitly selected workspace (set on /spaces). */
export function RequireWorkspace({ children }: { children: ReactNode }) {
  const { current, loading } = useWorkspace()
  const location = useLocation()

  if (loading) {
    return <PageLoader label="正在展开这个空间" />
  }

  if (!current) {
    return (
      <Navigate
        to="/spaces"
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  return children
}
