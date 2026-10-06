import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchWorkspaces,
  type Workspace,
} from '../../api/workspaces'
import { useAuth } from '../../auth/AuthContext'

const STORAGE_KEY = 'claner.currentWorkspaceId'

type WorkspaceState = {
  workspaces: Workspace[]
  current: Workspace | null
  loading: boolean
  error: string | null
  setCurrentId: (id: number) => void
  clearCurrent: () => void
  reload: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceState | null>(null)

function readStoredId(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentId, setCurrentIdState] = useState<number | null>(readStoredId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!user) {
      setWorkspaces([])
      setCurrentIdState(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await fetchWorkspaces()
      setWorkspaces(list)
      setCurrentIdState((prev) => {
        const stored = prev ?? readStoredId()
        // Only keep an explicitly chosen / stored workspace — never auto-pick.
        if (stored && list.some((w) => w.id === stored)) {
          return stored
        }
        return null
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setWorkspaces([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (currentId != null) {
      localStorage.setItem(STORAGE_KEY, String(currentId))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [currentId])

  const setCurrentId = useCallback((id: number) => {
    setCurrentIdState(id)
  }, [])

  const clearCurrent = useCallback(() => {
    setCurrentIdState(null)
  }, [])

  const current = useMemo(
    () => workspaces.find((w) => w.id === currentId) ?? null,
    [workspaces, currentId],
  )

  const value = useMemo(
    () => ({
      workspaces,
      current,
      loading,
      error,
      setCurrentId,
      clearCurrent,
      reload,
    }),
    [workspaces, current, loading, error, setCurrentId, clearCurrent, reload],
  )

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return ctx
}
