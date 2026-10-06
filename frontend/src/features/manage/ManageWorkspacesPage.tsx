import { Button, DatePicker, Form, Input, Table } from 'antd'
import type { Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createManageWorkspace,
  listManageWorkspaces,
  uploadManageWorkspaceAvatar,
  type ManageWorkspace,
} from '../../api/manage'
import { friendlyError } from '../../components/friendlyError'
import { resolveMediaUrl } from '../media/mediaUrl'
import { prepareAvatarForUpload } from '../media/prepareImageForUpload'
import { avatarInitial } from '../feed/time'
import {
  ManageEmpty,
  ManageFlash,
  ManageFormActions,
  ManageModal,
  ManagePageHeader,
  ManageToolbar,
} from './ManageChrome'

type CreateValues = {
  baby_name: string
  name?: string
  baby_birthday?: Dayjs | null
}

export function ManageWorkspacesPage() {
  const [items, setItems] = useState<ManageWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [form] = Form.useForm<CreateValues>()
  const babyNameWatch = Form.useWatch('baby_name', form)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listManageWorkspaces())
    } catch (err) {
      setError(friendlyError(err, '加载宝宝空间失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.baby_name.toLowerCase().includes(q) ||
        String(w.id).includes(q),
    )
  }, [items, search])

  function resetAvatar() {
    setAvatarFile(null)
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  function openCreate() {
    form.resetFields()
    resetAvatar()
    setOpen(true)
  }

  function closeModal() {
    if (submitting) return
    setOpen(false)
    form.resetFields()
    resetAvatar()
  }

  async function onCreate(values: CreateValues) {
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const babyName = values.baby_name.trim()
      const ws = await createManageWorkspace({
        baby_name: babyName,
        name: values.name?.trim() || undefined,
        baby_birthday: values.baby_birthday
          ? values.baby_birthday.format('YYYY-MM-DD')
          : null,
      })
      if (avatarFile) {
        const prepared = await prepareAvatarForUpload(avatarFile)
        await uploadManageWorkspaceAvatar(ws.id, prepared)
      }
      form.resetFields()
      resetAvatar()
      setOpen(false)
      setSuccess(`已创建宝宝空间「${babyName}」。请到「成员关系」分配家人。`)
      await reload()
    } catch (err) {
      setError(friendlyError(err, '创建宝宝空间失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const previewInitial = avatarInitial(babyNameWatch || '?')

  return (
    <>
      <ManagePageHeader
        title="宝宝空间"
        description="仅管理员可创建。创建后到「成员关系」把家人加入空间。"
        actions={
          <Button type="primary" onClick={openCreate}>
            新建宝宝空间
          </Button>
        }
      />
      <ManageFlash
        error={error}
        success={success}
        onCloseError={() => setError(null)}
        onCloseSuccess={() => setSuccess(null)}
      />
      <ManageToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="搜索名称 / 宝宝 / ID"
        count={filtered.length}
      />
      <div className="manage-table-wrap panel">
        <Table<ManageWorkspace>
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={filtered}
          pagination={false}
          locale={{
            emptyText: (
              <ManageEmpty
                description={
                  items.length === 0
                    ? '还没有宝宝空间。点击「新建宝宝空间」开始。'
                    : '没有匹配的空间。'
                }
              />
            ),
          }}
          columns={[
            {
              title: '封面',
              dataIndex: 'avatar_url',
              width: 72,
              render: (url: string, row) => {
                const src = (url || '').trim()
                  ? resolveMediaUrl(url.trim())
                  : ''
                return src ? (
                  <img className="manage-ws-thumb" src={src} alt="" />
                ) : (
                  <span className="manage-ws-thumb manage-ws-thumb--empty">
                    {avatarInitial(row.baby_name)}
                  </span>
                )
              },
            },
            {
              title: 'ID',
              dataIndex: 'id',
              width: 64,
              render: (id: number) => <span className="mono">{id}</span>,
            },
            {
              title: '宝宝',
              dataIndex: 'baby_name',
              render: (name: string) => <strong>{name}</strong>,
            },
            { title: '空间名', dataIndex: 'name' },
            {
              title: '生日',
              dataIndex: 'baby_birthday',
              render: (d: string | null) => d || '—',
            },
            {
              title: '创建时间',
              dataIndex: 'created_at',
              render: (iso: string) =>
                iso ? (
                  <span className="meta">
                    {new Date(iso).toLocaleDateString('zh-CN')}
                  </span>
                ) : (
                  '—'
                ),
            },
            {
              title: '',
              key: 'next',
              width: 120,
              render: (_: unknown, row) => (
                <Link
                  className="meta"
                  to={`/manage/memberships?workspace_id=${row.id}`}
                >
                  分配成员 →
                </Link>
              ),
            },
          ]}
        />
      </div>

      <ManageModal
        open={open}
        title="新建宝宝空间"
        onClose={closeModal}
        confirmLoading={submitting}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(v) => void onCreate(v)}
        >
          <Form.Item label="宝宝照片（可选）">
            <label className="manage-ws-cover-pick">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={submitting}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  e.target.value = ''
                  if (!file) return
                  setAvatarFile(file)
                  setAvatarPreview((prev) => {
                    if (prev) URL.revokeObjectURL(prev)
                    return URL.createObjectURL(file)
                  })
                }}
              />
              {avatarPreview ? (
                <img src={avatarPreview} alt="" />
              ) : (
                <span aria-hidden>{previewInitial}</span>
              )}
              <em>{avatarPreview ? '更换照片' : '点击上传'}</em>
            </label>
          </Form.Item>
          <Form.Item
            name="baby_name"
            label="宝宝名"
            rules={[{ required: true, whitespace: true, message: '请填写宝宝名' }]}
            validateTrigger="onBlur"
          >
            <Input placeholder="例如：小满" maxLength={50} autoFocus />
          </Form.Item>
          <Form.Item name="baby_birthday" label="出生日期（可选）">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item
            name="name"
            label="空间名称（可选）"
            extra="不填则默认为「宝宝名的空间」"
          >
            <Input
              placeholder={
                babyNameWatch?.trim()
                  ? `${babyNameWatch.trim()}的空间`
                  : '例如：小满的空间'
              }
              maxLength={100}
            />
          </Form.Item>
          <ManageFormActions
            submitting={submitting}
            submitLabel="创建"
            onCancel={closeModal}
          />
        </Form>
      </ManageModal>
    </>
  )
}
