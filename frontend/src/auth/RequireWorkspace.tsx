import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useWorkspace } from '../features/workspaces/WorkspaceContext'

/** Requires an explicitly selected workspace (set on /spaces). */
export function RequireWorkspace({ children }: { children: ReactNode }) {
  const { current, loading } = useWorkspace()
  const location = useLocation()

  if (loading) {
    return (
      <main className="shell">
        <p className="brand">Claner</p>
        <p className="status status-loading">加载空间…</p>
      </main>
    )
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
