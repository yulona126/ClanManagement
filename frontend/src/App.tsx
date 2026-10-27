import { useEffect } from 'react'
import { AntdProvider } from './antd/AntdProvider'
import { watchSystemTheme } from './features/theme/theme'
import { AppRoutes } from './routes/AppRoutes'
import './styles/app.css'

export default function App() {
  /*
   * 系统配色变化时跟随（仅在「跟随系统」模式下生效，且不做扩散动画）。
   * 放在最外层挂一次，避免每个用到主题的组件各挂一份。
   */
  useEffect(() => watchSystemTheme(), [])

  return (
    <AntdProvider>
      <AppRoutes />
    </AntdProvider>
  )
}
