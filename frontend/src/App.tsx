import { AntdProvider } from './antd/AntdProvider'
import { AppRoutes } from './routes/AppRoutes'
import './styles/app.css'

export default function App() {
  return (
    <AntdProvider>
      <AppRoutes />
    </AntdProvider>
  )
}
