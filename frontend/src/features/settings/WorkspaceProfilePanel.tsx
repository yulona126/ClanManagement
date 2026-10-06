import { App, DatePicker, Input } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  patchWorkspace,
  uploadWorkspaceAvatar,
} from '../../api/workspaces'
import { Button } from '../../components/ui'
import { friendlyError } from '../../components/friendlyError'
import { avatarInitial } from '../feed/time'
import { resolveMediaUrl } from '../media/mediaUrl'
import { prepareAvatarForUpload } from '../media/prepareImageForUpload'
import { useWorkspace } from '../workspaces/WorkspaceContext'

export function WorkspaceProfilePanel() {
  const { current, reload } = useWorkspace()
  const { message } = App.useApp()
  const fileRef = useRef<HTMLInputElement>(null)

  const [babyName, setBabyName] = useState('')
  const [name, setName] = useState('')
  const [birthday, setBirthday] = useState<Dayjs | null>(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!current) return
    setBabyName(current.baby_name)
    setName(current.name)
    setBirthday(current.baby_birthday ? dayjs(current.baby_birthday) : null)
    setAvatarUrl(current.avatar_url)
  }, [current])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!current) return
    if (!babyName.trim() || !name.trim()) {
      message.warning('请填写宝宝名和空间名称')
      return
    }
    setSaving(true)
    try {
      await patchWorkspace(current.id, {
        baby_name: babyName.trim(),
        name: name.trim(),
        baby_birthday: birthday ? birthday.format('YYYY-MM-DD') : null,
      })
      await reload()
      message.success('已保存')
    } catch (err) {
      message.error(friendlyError(err, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file || !current) return
    setUploading(true)
    try {
      const prepared = await prepareAvatarForUpload(file)
      const ws = await uploadWorkspaceAvatar(current.id, prepared)
      setAvatarUrl(ws.avatar_url)
      await reload()
      message.success('照片已更新')
    } catch (err) {
      message.error(friendlyError(err, '上传失败'))
    } finally {
      setUploading(false)
    }
  }

  if (!current) return null

  const coverSrc = avatarUrl.trim() ? resolveMediaUrl(avatarUrl.trim()) : ''
  const initial = avatarInitial(babyName || current.baby_name)

  return (
    <section className="settings-card">
      <header className="settings-card-head">
        <h2 className="settings-card-title">宝宝资料</h2>
        <p className="settings-card-desc">照片会显示在空间列表与家族图谱中。</p>
      </header>

      <div className="settings-profile-grid">
        <button
          type="button"
          className="workspace-profile-cover"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="更换宝宝照片"
        >
          {coverSrc ? (
            <img src={coverSrc} alt="" />
          ) : (
            <span className="workspace-profile-cover-fallback">{initial}</span>
          )}
          <span className="workspace-profile-cover-hint">
            {uploading ? '上传中…' : '更换照片'}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            void onPickPhoto(f)
          }}
        />

        <form
          className="settings-form stack"
          onSubmit={(e) => void onSave(e)}
        >
          <label className="settings-field">
            <span className="settings-label">宝宝名</span>
            <Input
              value={babyName}
              onChange={(e) => setBabyName(e.target.value)}
              maxLength={50}
              required
              disabled={saving}
            />
          </label>
          <label className="settings-field">
            <span className="settings-label">出生日期</span>
            <DatePicker
              className="settings-datepicker"
              value={birthday}
              onChange={(value) => setBirthday(value)}
              disabled={saving}
              allowClear
              format="YYYY-MM-DD"
            />
          </label>
          <label className="settings-field">
            <span className="settings-label">空间名称</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              disabled={saving}
            />
          </label>
          <div className="settings-form-actions">
            <Button variant="primary" type="submit" disabled={saving || uploading}>
              {saving ? '保存中…' : '保存资料'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}
