import { App } from 'antd'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { patchMe, uploadMyAvatar } from '../../api/auth'
import { Button } from '../../components/ui'
import { friendlyError } from '../../components/friendlyError'

export function MePage() {
  const { user, logout, refreshUser } = useAuth()
  const { message } = App.useApp()
  const fileRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    setDisplayName(user?.display_name ?? '')
    setBio(user?.bio ?? '')
    setAvatarUrl(user?.avatar_url ?? '')
  }, [user])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await patchMe({
        display_name: displayName.trim(),
        bio: bio.trim(),
      })
      await refreshUser()
      message.success('已保存')
    } catch (err) {
      message.error(friendlyError(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const me = await uploadMyAvatar(file)
      setAvatarUrl(me.avatar_url)
      await refreshUser()
      message.success('头像已更新')
    } catch (err) {
      message.error(friendlyError(err, '上传失败'))
    } finally {
      setUploading(false)
    }
  }

  const initial = (displayName || user?.username || '?').slice(0, 1)

  return (
    <div className="plain-page">
      <header className="plain-top">
        <Link to="/spaces">Claner</Link>
        <nav>
          <Link to="/spaces">空间</Link>
          {user?.is_staff ? <Link to="/manage">管理</Link> : null}
          <button type="button" className="plain-text-btn" onClick={logout}>
            退出
          </button>
        </nav>
      </header>

      <main className="plain-main">
        <button
          type="button"
          className="plain-avatar"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="更换头像"
        >
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initial}</span>}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            void onPickAvatar(f)
          }}
        />
        <p className="plain-hint">{uploading ? '上传中…' : '\u00a0'}</p>

        <form className="plain-form" onSubmit={(e) => void onSave(e)}>
          <label>
            显示名
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
            />
          </label>
          <label>
            登录名
            <input value={user?.username ?? ''} readOnly disabled />
          </label>
          <label>
            介绍
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              rows={2}
            />
          </label>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </form>
      </main>
    </div>
  )
}
