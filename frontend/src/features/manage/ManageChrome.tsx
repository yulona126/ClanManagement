import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Space,
  type ModalProps,
} from 'antd'
import type { ReactNode } from 'react'

export function ManagePageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="manage-page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p className="lede">{description}</p> : null}
      </div>
      {actions ? <div className="manage-page-actions">{actions}</div> : null}
    </header>
  )
}

export function ManageFlash({
  error,
  success,
  onCloseError,
  onCloseSuccess,
}: {
  error?: string | null
  success?: string | null
  onCloseError?: () => void
  onCloseSuccess?: () => void
}) {
  if (!error && !success) return null
  return (
    <div className="manage-flash">
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {error ? (
          <Alert
            type="error"
            showIcon
            closable={!!onCloseError}
            onClose={onCloseError}
            message={error}
          />
        ) : null}
        {success ? (
          <Alert
            type="success"
            showIcon
            closable={!!onCloseSuccess}
            onClose={onCloseSuccess}
            message={success}
          />
        ) : null}
      </Space>
    </div>
  )
}

export function ManageToolbar({
  search,
  onSearch,
  searchPlaceholder = '搜索…',
  count,
  extra,
}: {
  search: string
  onSearch: (value: string) => void
  searchPlaceholder?: string
  count?: number
  extra?: ReactNode
}) {
  return (
    <div className="manage-toolbar">
      <Input.Search
        allowClear
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        onSearch={onSearch}
        placeholder={searchPlaceholder}
        aria-label="搜索"
        style={{ maxWidth: 280 }}
      />
      {extra}
      {count != null ? <span className="meta">共 {count} 条</span> : null}
    </div>
  )
}

export function ManageEmpty({ description }: { description: ReactNode }) {
  return (
    <div className="manage-empty">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
    </div>
  )
}

export function ManageModal({
  open,
  title,
  onClose,
  children,
  width = 440,
  confirmLoading,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  width?: ModalProps['width']
  confirmLoading?: boolean
}) {
  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      maskClosable={!confirmLoading}
      closable={!confirmLoading}
      width={width}
      centered
    >
      {children}
    </Modal>
  )
}

export function ManageFormActions({
  submitting,
  submitLabel,
  onCancel,
}: {
  submitting?: boolean
  submitLabel: string
  onCancel: () => void
}) {
  return (
    <Space className="manage-form-actions" style={{ marginTop: 8 }}>
      <Button type="primary" htmlType="submit" loading={submitting}>
        {submitLabel}
      </Button>
      <Button disabled={submitting} onClick={onCancel}>
        取消
      </Button>
    </Space>
  )
}
