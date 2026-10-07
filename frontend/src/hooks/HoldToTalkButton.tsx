import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { formatDuration, useVoiceRecorder } from './useVoiceRecorder'

type Props = {
  disabled?: boolean
  onRecorded: (blob: Blob, mimeType: string, durationMs: number) => void | Promise<void>
  label?: string
}

export function HoldToTalkButton({
  disabled,
  onRecorded,
  label = '按住说话',
}: Props) {
  const { isRecording, durationMs, error, supported, start, stop, cancel, setError } =
    useVoiceRecorder()
  const busyRef = useRef(false)
  const activePointerRef = useRef<number | null>(null)
  /** Avoid treating intentional release as a cancel. */
  const finishingRef = useRef(false)

  async function begin(e: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || busyRef.current || isRecording) return
    setError(null)
    finishingRef.current = false
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
      activePointerRef.current = e.pointerId
    } catch {
      /* older browsers */
    }
    await start()
  }

  async function end(e: ReactPointerEvent<HTMLButtonElement>) {
    if (activePointerRef.current != null && e.pointerId !== activePointerRef.current) {
      return
    }
    finishingRef.current = true
    activePointerRef.current = null
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* ignore */
    }
    if (!isRecording || busyRef.current) {
      finishingRef.current = false
      return
    }
    busyRef.current = true
    try {
      const result = await stop()
      if (result) {
        await onRecorded(result.blob, result.mimeType, result.durationMs)
      }
    } finally {
      busyRef.current = false
      finishingRef.current = false
    }
  }

  function onCancel(e: ReactPointerEvent<HTMLButtonElement>) {
    if (finishingRef.current) return
    if (activePointerRef.current != null && e.pointerId !== activePointerRef.current) {
      return
    }
    activePointerRef.current = null
    if (isRecording) cancel()
  }

  if (!supported) {
    return (
      <p className="form-error">当前浏览器不支持录音（需 HTTPS 或 localhost）。</p>
    )
  }

  return (
    <div className="hold-talk">
      <button
        type="button"
        className={`ui-btn ui-btn--ghost hold-talk-btn${isRecording ? ' is-recording' : ''}`}
        disabled={disabled}
        onPointerDown={(e) => {
          e.preventDefault()
          void begin(e)
        }}
        onPointerUp={(e) => void end(e)}
        onPointerCancel={onCancel}
        onLostPointerCapture={() => {
          if (finishingRef.current || busyRef.current) return
          if (isRecording) cancel()
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isRecording ? `录音中 ${formatDuration(durationMs)}` : label}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  )
}
