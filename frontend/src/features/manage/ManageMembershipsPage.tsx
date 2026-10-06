import { Button, Form, Input, Select, Table, Tag } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createManageMembership,
  listManageMemberships,
  listManageUsers,
  listManageWorkspaces,
  type ManageMembership,
  type ManageUser,
  type ManageWorkspace,
} from '../../api/manage'
import type { WorkspaceRole } from '../../api/workspaces'
import { friendlyError } from '../../components/friendlyError'
import {
  ManageEmpty,
  ManageFlash,
  ManageFormActions,
  ManageModal,
  ManagePageHeader,
  ManageToolbar,
} from './ManageChrome'
import { ROLE_OPTIONS, roleLabel } from './roleLabels'

type AssignValues = {
  user_id: number
  workspace_id: number
  relation_label: string
  role: WorkspaceRole
  anchor_membership_id?: number
  anchor_label?: string
}

export function ManageMembershipsPage() {
  const [searchParams] = useSearchParams()
  const [users, setUsers] = useState<ManageUser[]>([])
  const [workspaces, setWorkspaces] = useState<ManageWorkspace[]>([])
  const [memberships, setMemberships] = useState<ManageMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterWs, setFilterWs] = useState<string>(
    () => searchParams.get('workspace_id') || 'all',
  )
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<AssignValues>()
  const workspaceId = Form.useWatch('workspace_id', form)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [u, w, m] = await Promise.all([
        listManageUsers(),
        listManageWorkspaces(),
        listManageMemberships(),
      ])
      setUsers(u)
      setWorkspaces(w)
      setMemberships(m)
    } catch (err) {
      setError(friendlyError(err, '加载成员关系失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const filtered = useMemo(() => {
    let list = memberships
    if (filterWs !== 'all') {
      list = list.filter((m) => String(m.workspace_id) === filterWs)
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        m.baby_name.toLowerCase().includes(q) ||
        m.relation_label.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q),
    )
  }, [memberships, filterWs, search])

  const anchorsInWorkspace = useMemo(() => {
    if (!workspaceId) return []
    return memberships.filter((m) => m.workspace_id === workspaceId)
  }, [memberships, workspaceId])

  const needsAnchor = anchorsInWorkspace.length > 0

  useEffect(() => {
    if (!open) return
    if (!needsAnchor) {
      form.setFieldsValue({
        anchor_membership_id: undefined,
        anchor_label: undefined,
      })
      return
    }
    const current = form.getFieldValue('anchor_membership_id') as
      | number
      | undefined
    if (
      current &&
      anchorsInWorkspace.some((m) => m.id === current)
    ) {
      return
    }
    form.setFieldsValue({ anchor_membership_id: anchorsInWorkspace[0]?.id })
  }, [open, needsAnchor, anchorsInWorkspace, form])

  function openModal() {
    form.setFieldsValue({
      user_id: users[0]?.id,
      workspace_id: workspaces[0]?.id,
      role: 'viewer',
      relation_label: '',
      anchor_membership_id: undefined,
      anchor_label: '',
    })
    setOpen(true)
  }

  function closeModal() {
    if (submitting) return
    setOpen(false)
    form.resetFields()
  }

  async function onAssign(values: AssignValues) {
    if (needsAnchor && (!values.anchor_membership_id || !values.anchor_label?.trim())) {
      setError('该工作区已有成员，请选择相对谁并填写关系')
      return
    }
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      await createManageMembership({
        user_id: values.user_id,
        workspace_id: values.workspace_id,
        role: values.role,
        relation_label: values.relation_label.trim(),
        ...(needsAnchor
          ? {
              anchor_membership_id: values.anchor_membership_id,
              anchor_label: values.anchor_label!.trim(),
            }
          : {}),
      })
      const uname =
        users.find((u) => u.id === values.user_id)?.username ??
        String(values.user_id)
      form.resetFields()
      setOpen(false)
      setSuccess(`已将 ${uname} 加入工作区`)
      await reload()
    } catch (err) {
      setError(friendlyError(err, '分配失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const canAssign = users.length > 0 && workspaces.length > 0

  return (
    <>
      <ManagePageHeader
        title="成员关系"
        description="把用户加入工作区，并设置角色与在该空间的称呼。"
        actions={
          <Button type="primary" disabled={!canAssign} onClick={openModal}>
            分配成员
          </Button>
        }
      />
      {!canAssign && !loading ? (
        <p className="meta manage-hint">
          请先在「用户」和「工作区」中至少各创建一条记录。
        </p>
      ) : null}
      <ManageFlash
        error={error}
        success={success}
        onCloseError={() => setError(null)}
        onCloseSuccess={() => setSuccess(null)}
      />
      <ManageToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="搜索用户 / 宝宝 / 称呼"
        count={filtered.length}
        extra={
          <Select
            value={filterWs}
            onChange={setFilterWs}
            style={{ minWidth: 140 }}
            options={[
              { value: 'all', label: '全部工作区' },
              ...workspaces.map((w) => ({
                value: String(w.id),
                label: w.baby_name,
              })),
            ]}
          />
        }
      />

      <div className="manage-table-wrap panel">
        <Table<ManageMembership>
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={filtered}
          pagination={false}
          locale={{
            emptyText: (
              <ManageEmpty
                description={
                  memberships.length === 0
                    ? '还没有成员关系。点击「分配成员」。'
                    : '当前筛选下没有结果。'
                }
              />
            ),
          }}
          columns={[
            {
              title: '用户',
              dataIndex: 'username',
              render: (name: string) => <strong>{name}</strong>,
            },
            {
              title: '工作区 / 宝宝',
              render: (_, m) => (
                <>
                  {m.baby_name}
                  <span className="meta"> · {m.workspace_name}</span>
                </>
              ),
            },
            {
              title: '角色',
              dataIndex: 'role',
              render: (role: WorkspaceRole) => (
                <Tag>{roleLabel(role)}</Tag>
              ),
            },
            { title: '称呼', dataIndex: 'relation_label' },
          ]}
        />
      </div>

      <ManageModal
        open={open}
        title="分配成员"
        onClose={closeModal}
        confirmLoading={submitting}
        width={480}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={(v) => void onAssign(v)}
        >
          <Form.Item
            name="user_id"
            label="用户"
            rules={[{ required: true, message: '请选择用户' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={users.map((u) => ({
                value: u.id,
                label: u.username,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="workspace_id"
            label="工作区"
            rules={[{ required: true, message: '请选择工作区' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={workspaces.map((w) => ({
                value: w.id,
                label: `${w.baby_name}（${w.name}）`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="relation_label"
            label="对宝宝称呼"
            rules={[{ required: true, message: '请填写称呼' }]}
          >
            <Input placeholder="例如：妈妈 / 舅舅" />
          </Form.Item>
          {needsAnchor ? (
            <>
              <Form.Item
                name="anchor_membership_id"
                label="相对谁"
                rules={[{ required: true, message: '请选择相对谁' }]}
              >
                <Select
                  options={anchorsInWorkspace.map((m) => ({
                    value: m.id,
                    label: `${m.username}（${m.relation_label}）`,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="anchor_label"
                label="相对关系"
                rules={[{ required: true, message: '请填写相对关系' }]}
              >
                <Input placeholder="例如：弟弟 / 朋友" />
              </Form.Item>
            </>
          ) : (
            <p className="meta">该工作区尚无成员，将成为首位（只需对宝宝称呼）。</p>
          )}
          <Form.Item name="role" label="角色" initialValue="viewer">
            <Select
              options={ROLE_OPTIONS.map((r) => ({
                value: r.value,
                label: r.label,
              }))}
            />
          </Form.Item>
          <ManageFormActions
            submitting={submitting}
            submitLabel="确认分配"
            onCancel={closeModal}
          />
        </Form>
      </ManageModal>
    </>
  )
}
