import { useRef } from 'react'
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

  async function begin() {
    if (disabled || busyRef.current || isRecording) return
    setError(null)
    await start()
  }

  async function end() {
    if (!isRecording || busyRef.current) return
    busyRef.current = true
    try {
      const result = await stop()
      if (result) {
        await onRecorded(result.blob, result.mimeType, result.durationMs)
      }
    } finally {
      busyRef.current = false
    }
  }

  if (!supported) {
    return null
  }

  return (
    <div className="hold-talk">
      <button
        type="button"
        className={`ui-btn ui-btn--ghost hold-talk-btn${isRecording ? ' is-recording' : ''}`}
        disabled={disabled}
        onPointerDown={(e) => {
          e.preventDefault()
          void begin()
        }}
        onPointerUp={() => void end()}
        onPointerCancel={() => {
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
