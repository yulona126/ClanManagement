import { App, Input, Select } from 'antd'
import { useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'
import { useAuth } from '../../auth/AuthContext'
import {
  fetchMembers,
  inviteMember,
  patchMember,
  removeMember,
  type Membership,
  type WorkspaceRole,
} from '../../api/workspaces'
import { Button } from '../../components/ui'
import { roleLabel, ROLE_OPTIONS } from '../manage/roleLabels'
import { avatarInitial } from '../feed/time'
import { useWorkspace } from './WorkspaceContext'

const ROLE_SELECT_OPTIONS = ROLE_OPTIONS.map((r) => ({
  value: r.value,
  label: r.label,
}))

export function MembersPanel() {
  const { current, reload: reloadWorkspaces } = useWorkspace()
  const { user } = useAuth()
  const { modal } = App.useApp()
  const [members, setMembers] = useState<Membership[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('viewer')
  const [inviteLabel, setInviteLabel] = useState('')
  const [anchorMembershipId, setAnchorMembershipId] = useState('')
  const [anchorLabel, setAnchorLabel] = useState('')
  const [inviting, setInviting] = useState(false)

  const isOwner = current?.my_role === 'owner'
  const needsAnchor = members.length > 0

  async function loadMembers() {
    if (!current) {
      setMembers([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await fetchMembers(current.id)
      setMembers(list)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  useEffect(() => {
    if (!showInvite || members.length === 0) return
    setAnchorMembershipId((prev) => {
      if (prev) return prev
      const mine = members.find((m) => m.user_id === user?.id)
      return String(mine?.id ?? members[0].id)
    })
  }, [showInvite, members, user?.id])

  async function saveMember(
    member: Membership,
    patch: Partial<Pick<Membership, 'role' | 'relation_label'>>,
  ) {
    if (!current) return
    setSavingId(member.id)
    setError(null)
    try {
      const updated = await patchMember(current.id, member.id, patch)
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      await reloadWorkspaces()
    } catch (err) {
      setError(formatErr(err))
    } finally {
      setSavingId(null)
    }
  }

  function onRemove(member: Membership) {
    if (!current) return
    modal.confirm({
      title: `确定移除成员 ${member.username}？`,
      content: '移除后对方将无法再访问该空间。',
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setSavingId(member.id)
        setError(null)
        try {
          await removeMember(current.id, member.id)
          await loadMembers()
          await reloadWorkspaces()
        } catch (err) {
          setError(formatErr(err))
          throw err
        } finally {
          setSavingId(null)
        }
      },
    })
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault()
    if (!current) return
    setInviting(true)
    setError(null)
    try {
      await inviteMember(current.id, {
        username: inviteUsername.trim(),
        password: invitePassword || undefined,
        role: inviteRole,
        relation_label: inviteLabel.trim(),
        ...(needsAnchor
          ? {
              anchor_membership_id: Number(anchorMembershipId),
              anchor_label: anchorLabel.trim(),
            }
          : {}),
      })
      setInviteUsername('')
      setInvitePassword('')
      setInviteLabel('')
      setInviteRole('viewer')
      setAnchorLabel('')
      setAnchorMembershipId('')
      setShowInvite(false)
      await loadMembers()
      await reloadWorkspaces()
    } catch (err) {
      setError(formatErr(err))
    } finally {
      setInviting(false)
    }
  }

  if (!current) {
    return null
  }

  return (
    <section className="settings-card">
      <header className="settings-card-head settings-card-head--row">
        <div>
          <h2 className="settings-card-title">成员</h2>
          <p className="settings-card-desc">
            {members.length} 位家人 · 称呼会显示在动态与家族图谱
          </p>
        </div>
        {isOwner ? (
          <Button
            variant={showInvite ? 'ghost' : 'primary'}
            type="button"
            onClick={() => setShowInvite((v) => !v)}
          >
            {showInvite ? '取消' : '邀请成员'}
          </Button>
        ) : null}
      </header>

      {showInvite && isOwner ? (
        <form className="settings-invite-form" onSubmit={onInvite}>
          <div className="settings-invite-grid">
            <label className="member-edit-field">
              <span className="settings-label">用户名</span>
              <Input
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                required
                disabled={inviting}
              />
            </label>
            <label className="member-edit-field">
              <span className="settings-label">初始密码（新用户必填）</span>
              <Input.Password
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                autoComplete="new-password"
                disabled={inviting}
              />
            </label>
            <label className="member-edit-field">
              <span className="settings-label">对宝宝称呼</span>
              <Input
                value={inviteLabel}
                onChange={(e) => setInviteLabel(e.target.value)}
                placeholder="如：叔叔"
                required
                disabled={inviting}
              />
            </label>
            <label className="member-edit-field">
              <span className="settings-label">权限</span>
              <Select
                className="settings-select"
                value={inviteRole}
                options={ROLE_SELECT_OPTIONS}
                onChange={(value) => setInviteRole(value)}
                disabled={inviting}
              />
            </label>
            {needsAnchor ? (
              <>
                <label className="member-edit-field">
                  <span className="settings-label">相对谁</span>
                  <Select
                    className="settings-select"
                    value={anchorMembershipId || undefined}
                    options={members.map((m) => ({
                      value: String(m.id),
                      label: `${m.display_name || m.username}（${m.relation_label}）`,
                    }))}
                    onChange={(value) => setAnchorMembershipId(value)}
                    disabled={inviting}
                  />
                </label>
                <label className="member-edit-field">
                  <span className="settings-label">相对关系</span>
                  <Input
                    value={anchorLabel}
                    onChange={(e) => setAnchorLabel(e.target.value)}
                    placeholder="如：弟弟 / 朋友"
                    required
                    disabled={inviting}
                  />
                </label>
              </>
            ) : null}
          </div>
          <div className="settings-form-actions">
            <Button variant="primary" type="submit" disabled={inviting}>
              {inviting ? '邀请中…' : '发送邀请'}
            </Button>
          </div>
          <p className="meta">
            已有账号只需用户名；新账号需设初始密码。
            {needsAnchor ? ' 新成员须挂到现有某位成员上。' : ''}
          </p>
        </form>
      ) : null}

      {loading ? <p className="meta">加载中…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <ul className="member-list member-list--settings">
        {members.map((m) => (
          <li key={m.id} className="member-row member-row--settings">
            <div className="member-row-identity">
              <span className="member-avatar" aria-hidden>
                {avatarInitial(m.relation_label || m.username)}
              </span>
              <div className="member-row-text">
                <span className="member-relation">{m.relation_label}</span>
                <span className="member-username">{m.username}</span>
              </div>
              {!isOwner ? (
                <span className="role-pill">{roleLabel(m.role)}</span>
              ) : null}
            </div>
            {isOwner ? (
              <div className="member-edit member-edit--settings">
                <label className="member-edit-field">
                  <span className="settings-label">称呼</span>
                  <Input
                    aria-label={`${m.username} 称呼`}
                    defaultValue={m.relation_label}
                    key={`${m.id}-${m.relation_label}`}
                    disabled={savingId === m.id}
                    onBlur={(e) => {
                      const next = e.target.value.trim()
                      if (next && next !== m.relation_label) {
                        void saveMember(m, { relation_label: next })
                      }
                    }}
                  />
                </label>
                <label className="member-edit-field">
                  <span className="settings-label">权限</span>
                  <Select
                    className="settings-select"
                    aria-label={`${m.username} 角色`}
                    value={m.role}
                    options={ROLE_SELECT_OPTIONS}
                    disabled={savingId === m.id || m.role === 'owner'}
                    onChange={(role) => {
                      if (role !== m.role) {
                        void saveMember(m, { role })
                      }
                    }}
                  />
                </label>
                {m.role !== 'owner' ? (
                  <Button
                    variant="ghost"
                    type="button"
                    className="member-remove-btn"
                    disabled={savingId === m.id}
                    onClick={() => onRemove(m)}
                  >
                    移除
                  </Button>
                ) : (
                  <span className="member-edit-spacer" aria-hidden />
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function formatErr(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data
    if (typeof detail === 'string') return detail
    if (detail && typeof detail === 'object') return JSON.stringify(detail)
    return err.message
  }
  return err instanceof Error ? err.message : String(err)
}
