import { usePwaUpdate } from './usePwaUpdate'

/**
 * 新版本提示条。
 *
 * 出现在页面右下角，不遮挡内容：
 *   - 「立即更新」→ 激活新 SW 并 reload
 *   - 「稍后」→ 本次不再提示（用户切后台时会自动装上，下次打开即新版本）
 */
export function PwaUpdateToast() {
  const { needRefresh, apply, dismiss } = usePwaUpdate()

  if (!needRefresh) return null

  return (
    <div className="pwa-toast" role="status" aria-live="polite">
      <span className="pwa-toast__icon" aria-hidden>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-2.6-6.4" />
          <path d="M21 4v5h-5" />
        </svg>
      </span>
      <span className="pwa-toast__text">
        <b>有新版本</b>
        <i>更新后看到最新改动</i>
      </span>
      <button type="button" className="pwa-toast__apply" onClick={apply}>
        立即更新
      </button>
      <button type="button" className="pwa-toast__later" onClick={dismiss}>
        稍后
      </button>
    </div>
  )
}
