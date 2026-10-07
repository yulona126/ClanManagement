import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceRecorderState = {
  isRecording: boolean
  durationMs: number
  error: string | null
  supported: boolean
}

/** Prefer mp4/aac when available (plays on iOS); fall back to webm on Chromium. */
function pickMimeType(): string {
  const candidates = [
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ]
  if (typeof MediaRecorder === 'undefined') return ''
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

/** OSS / browsers dislike `codecs=` in Content-Type for signed PUT. */
export function normalizeAudioContentType(mimeType: string): string {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase()
  if (base === 'audio/aac' || base === 'audio/x-m4a') return 'audio/mp4'
  if (base.startsWith('audio/')) return base
  return 'audio/webm'
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined',
  )

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const mimeTypeRef = useRef('')

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => {
      clearTimer()
      cleanupStream()
      mediaRecorderRef.current?.stop()
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    if (!supported) {
      setError('当前浏览器不支持录音。')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      mimeTypeRef.current = mimeType
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      mediaRecorderRef.current = recorder
      startedAtRef.current = Date.now()
      setDurationMs(0)
      clearTimer()
      timerRef.current = window.setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current)
      }, 200)
      recorder.start(200)
      setIsRecording(true)
    } catch (err) {
      cleanupStream()
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('请允许使用麦克风后再试。')
      } else {
        setError(err instanceof Error ? err.message : '无法访问麦克风')
      }
      setIsRecording(false)
    }
  }, [supported])

  const stop = useCallback((): Promise<{
    blob: Blob
    mimeType: string
    durationMs: number
  } | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        setIsRecording(false)
        clearTimer()
        cleanupStream()
        resolve(null)
        return
      }
      recorder.onstop = () => {
        clearTimer()
        const duration = Date.now() - startedAtRef.current
        setDurationMs(duration)
        const rawMime = mimeTypeRef.current || recorder.mimeType || 'audio/webm'
        const mimeType = normalizeAudioContentType(rawMime)
        const blob = new Blob(chunksRef.current, { type: mimeType })
        chunksRef.current = []
        cleanupStream()
        mediaRecorderRef.current = null
        setIsRecording(false)
        if (blob.size < 64 || duration < 400) {
          setError('录音太短，请按住多说一会儿。')
          resolve(null)
          return
        }
        resolve({ blob, mimeType, durationMs: duration })
      }
      recorder.stop()
    })
  }, [])

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      try {
        recorder.stop()
      } catch {
        /* ignore */
      }
    }
    chunksRef.current = []
    mediaRecorderRef.current = null
    clearTimer()
    cleanupStream()
    setIsRecording(false)
    setDurationMs(0)
  }, [])

  return {
    isRecording,
    durationMs,
    error,
    supported,
    start,
    stop,
    cancel,
    setError,
  }
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
