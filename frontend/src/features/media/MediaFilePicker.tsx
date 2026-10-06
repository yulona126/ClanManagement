import { UploadOutlined } from '@ant-design/icons'
import { Button, Upload } from 'antd'
import { useState } from 'react'

type Props = {
  disabled?: boolean
  accept?: string
  onFiles: (files: File[]) => void | Promise<void>
  label?: string
}

export function MediaFilePicker({
  disabled,
  accept = 'image/*,video/*,image/heic,image/heif',
  onFiles,
  label = '添加照片/视频',
}: Props) {
  const [busy, setBusy] = useState(false)

  return (
    <Upload
      accept={accept}
      multiple
      showUploadList={false}
      disabled={disabled || busy}
      beforeUpload={(file, fileList) => {
        // antd calls beforeUpload once per file; batch on the last
        if (file !== fileList[fileList.length - 1]) return false
        void (async () => {
          setBusy(true)
          try {
            await onFiles(fileList)
          } finally {
            setBusy(false)
          }
        })()
        return false
      }}
    >
      <Button icon={<UploadOutlined />} disabled={disabled || busy} loading={busy}>
        {busy ? '上传中…' : label}
      </Button>
    </Upload>
  )
}
