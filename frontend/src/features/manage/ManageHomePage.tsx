import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listManageMemberships,
  listManageUsers,
  listManageWorkspaces,
} from '../../api/manage'
import { Button } from '../../components/ui'
import { friendlyError } from '../../components/friendlyError'
import { ManageFlash, ManagePageHeader } from './ManageChrome'

export function ManageHomePage() {
  const [users, setUsers] = useState(0)
  const [workspaces, setWorkspaces] = useState(0)
  const [memberships, setMemberships] = useState(0)
  const [staffCount, setStaffCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [u, w, m] = await Promise.all([
          listManageUsers(),
          listManageWorkspaces(),
          listManageMemberships(),
        ])
        if (cancelled) return
        setUsers(u.length)
        setWorkspaces(w.length)
        setMemberships(m.length)
        setStaffCount(u.filter((x) => x.is_staff).length)
      } catch (err) {
        if (!cancelled) setError(friendlyError(err, '加载概览失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const cards = useMemo(
    () => [
      { label: '用户', value: users, to: '/manage/users', hint: '全局账号' },
      {
        label: '宝宝空间',
        value: workspaces,
        to: '/manage/workspaces',
        hint: '每个宝宝一个空间',
      },
      {
        label: '成员关系',
        value: memberships,
        to: '/manage/memberships',
        hint: '用户 × 宝宝空间',
      },
      {
        label: '管理员',
        value: staffCount,
        to: '/manage/users',
        hint: 'is_staff',
      },
    ],
    [users, workspaces, memberships, staffCount],
  )

  return (
    <>
      <ManagePageHeader
        title="概览"
        description="Claner 实例管理。先建用户与宝宝空间，再分配成员。"
      />
      <ManageFlash error={error} onCloseError={() => setError(null)} />
      {loading ? <p className="meta">加载中…</p> : null}
      <div className="manage-stat-grid">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="manage-stat-card">
            <span className="manage-stat-label">{c.label}</span>
            <strong className="manage-stat-value">{loading ? '—' : c.value}</strong>
            <span className="meta">{c.hint}</span>
          </Link>
        ))}
      </div>
      <section className="manage-quick panel">
        <h2 className="section-title">常用操作</h2>
        <div className="btn-row">
          <Button variant="primary" to="/manage/users">
            新建用户
          </Button>
          <Button variant="ghost" to="/manage/workspaces">
            新建宝宝空间
          </Button>
          <Button variant="ghost" to="/manage/memberships">
            分配成员
          </Button>
        </div>
        <ol className="manage-steps meta">
          <li>创建家人账号（用户）</li>
          <li>创建宝宝空间</li>
          <li>把用户加入空间并设置角色与称呼</li>
        </ol>
      </section>
    </>
  )
}
