import { Button, Form, Input, Table, Tag } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createManageUser,
  listManageUsers,
  type ManageUser,
} from '../../api/manage'
import { friendlyError } from '../../components/friendlyError'
import {
  ManageEmpty,
  ManageFlash,
  ManageFormActions,
  ManageModal,
  ManagePageHeader,
  ManageToolbar,
} from './ManageChrome'

type CreateValues = {
  username: string
  password: string
  email?: string
}

export function ManageUsersPage() {
  const [users, setUsers] = useState<ManageUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<CreateValues>()

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await listManageUsers())
    } catch (err) {
      setError(friendlyError(err, '加载用户失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        String(u.id).includes(q),
    )
  }, [users, search])

  function closeModal() {
    if (submitting) return
    setOpen(false)
    form.resetFields()
  }

  async function onCreate(values: CreateValues) {
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      await createManageUser({
        username: values.username.trim(),
        password: values.password,
        email: values.email?.trim() || undefined,
      })
      form.resetFields()
      setOpen(false)
      setSuccess(`已创建用户 ${values.username.trim()}`)
      await reload()
    } catch (err) {
      setError(friendlyError(err, '创建用户失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <ManagePageHeader
        title="用户"
        description="全局账号。不做公开注册；此处创建后可分配到工作区。"
        actions={
          <Button type="primary" onClick={() => setOpen(true)}>
            新建用户
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
        searchPlaceholder="搜索用户名 / 邮箱 / ID"
        count={filtered.length}
      />
      <div className="manage-table-wrap panel">
        <Table<ManageUser>
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={filtered}
          pagination={false}
          locale={{
            emptyText: (
              <ManageEmpty
                description={
                  users.length === 0
                    ? '还没有用户。点击「新建用户」开始。'
                    : '没有匹配的用户。'
                }
              />
            ),
          }}
          columns={[
            {
              title: 'ID',
              dataIndex: 'id',
              width: 72,
              render: (id: number) => <span className="mono">{id}</span>,
            },
            {
              title: '用户名',
              dataIndex: 'username',
              render: (name: string) => <strong>{name}</strong>,
            },
            {
              title: '邮箱',
              dataIndex: 'email',
              render: (email: string) => email || '—',
            },
            {
              title: '角色标记',
              dataIndex: 'is_staff',
              render: (staff: boolean) =>
                staff ? (
                  <Tag color="default">管理员</Tag>
                ) : (
                  <span className="meta">成员</span>
                ),
            },
          ]}
        />
      </div>

      <ManageModal
        open={open}
        title="新建用户"
        onClose={closeModal}
        confirmLoading={submitting}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(v) => void onCreate(v)}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请填写用户名' }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[{ required: true, message: '请填写初始密码' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="email" label="邮箱（可选）">
            <Input type="email" />
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
