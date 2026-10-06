import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireStaff } from '../auth/RequireStaff'
import { RequireWorkspace } from '../auth/RequireWorkspace'
import { ManageShell } from '../components/ManageShell'
import { UserShell } from '../components/UserShell'
import { LoginPage } from '../features/auth/LoginPage'
import { FeedPage } from '../features/feed/FeedPage'
import { FamilyPage } from '../features/family/FamilyPage'
import { ManageHomePage } from '../features/manage/ManageHomePage'
import { ManageMembershipsPage } from '../features/manage/ManageMembershipsPage'
import { ManageUsersPage } from '../features/manage/ManageUsersPage'
import { ManageWorkspacesPage } from '../features/manage/ManageWorkspacesPage'
import { AlbumDetailPage } from '../features/media/AlbumDetailPage'
import { AlbumHomePage } from '../features/media/AlbumHomePage'
import { AllPhotosPage } from '../features/media/AllPhotosPage'
import { MePage } from '../features/me/MePage'
import { RecordDetailPage } from '../features/records/RecordDetailPage'
import { RecordFormPage } from '../features/records/RecordFormPage'
import { WorkspaceSettingsPage } from '../features/settings/WorkspaceSettingsPage'
import { WorkspacePickerPage } from '../features/workspaces/WorkspacePickerPage'
import { WorkspaceProvider } from '../features/workspaces/WorkspaceContext'
import { PwaUpdateToast } from '../pwa/PwaUpdateToast'

function AuthedLayout() {
  return (
    <RequireAuth>
      <WorkspaceProvider>
        <Outlet />
      </WorkspaceProvider>
    </RequireAuth>
  )
}

function WorkspaceAppLayout() {
  return (
    <RequireWorkspace>
      <UserShell>
        <Outlet />
      </UserShell>
    </RequireWorkspace>
  )
}

function ManageLayout() {
  return (
    <RequireAuth>
      <RequireStaff>
        <ManageShell>
          <Outlet />
        </ManageShell>
      </RequireStaff>
    </RequireAuth>
  )
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PwaUpdateToast />
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<AuthedLayout />}>
            <Route path="spaces" element={<WorkspacePickerPage />} />
            <Route
              path="spaces/new"
              element={<Navigate to="/manage/workspaces" replace />}
            />
            <Route path="me" element={<MePage />} />

            <Route element={<WorkspaceAppLayout />}>
              <Route index element={<FeedPage />} />
              <Route path="feed" element={<Navigate to="/" replace />} />
              <Route path="album" element={<AlbumHomePage />} />
              <Route path="album/all" element={<AllPhotosPage />} />
              <Route path="album/:albumId" element={<AlbumDetailPage />} />
              <Route path="family" element={<FamilyPage />} />
              <Route path="compose" element={<RecordFormPage mode="create" />} />
              <Route path="settings/workspace" element={<WorkspaceSettingsPage />} />
              <Route path="records/:recordId" element={<RecordDetailPage />} />
              <Route
                path="records/:recordId/edit"
                element={<RecordFormPage mode="edit" />}
              />
            </Route>
          </Route>

          <Route path="media" element={<Navigate to="/album" replace />} />
          <Route path="records/new" element={<Navigate to="/compose" replace />} />
          <Route path="records" element={<Navigate to="/" replace />} />

          <Route path="manage" element={<ManageLayout />}>
            <Route index element={<ManageHomePage />} />
            <Route path="users" element={<ManageUsersPage />} />
            <Route path="workspaces" element={<ManageWorkspacesPage />} />
            <Route path="memberships" element={<ManageMembershipsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/spaces" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
