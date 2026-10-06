import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'
import { antdTheme } from './theme'

type Props = {
  children: ReactNode
}

/**
 * Global antd shell: zh-CN locale, Claner Minimal White theme, App context
 * (message / modal / notification). Import components on demand from `antd`.
 */
export function AntdProvider({ children }: Props) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={antdTheme}
      componentSize="middle"
      wave={{ disabled: true }}
      form={{
        requiredMark: 'optional',
        validateMessages: {
          required: '请填写${label}',
        },
      }}
    >
      <App
        message={{ maxCount: 3, duration: 3 }}
        notification={{ placement: 'topRight', duration: 4 }}
      >
        {children}
      </App>
    </ConfigProvider>
  )
}
