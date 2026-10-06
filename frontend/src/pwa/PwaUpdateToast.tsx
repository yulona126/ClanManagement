import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) {
    return null
  }

  return (
    <div className="pwa-toast" role="status">
      <span>发现新版本</span>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        刷新
      </button>
      <button type="button" onClick={() => setNeedRefresh(false)}>
        稍后
      </button>
    </div>
  )
}
