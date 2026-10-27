import { App, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'
import { useTheme } from '../features/theme/useTheme'
import { antdDarkTheme, antdTheme } from './theme'

type Props = {
  children: ReactNode
}

/**
 * Global antd shell: zh-CN locale, Claner Minimal White theme, App context
 * (message / modal / notification). Import components on demand from `antd`.
 */
export function AntdProvider({ children }: Props) {
  const { resolved } = useTheme()

  /*
   * antd 有自己的调色系统（seed → 派生 hover/active），
   * 只换 CSS 变量管不到它，必须同时切 algorithm，
   * 否则深色页面上弹窗、下拉、输入框仍是白底。
   */
  // 两套主题由同一套规则按调色板构造，颜色不会漏（组件级 token 也一起换）
  const theme = resolved === 'dark' ? antdDarkTheme : antdTheme

  return (
    <ConfigProvider
      locale={zhCN}
      theme={theme}
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
