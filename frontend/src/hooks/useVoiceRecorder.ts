import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceRecorderState = {
  isRecording: boolean
  durationMs: number
  error: string | null
  supported: boolean
}

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  if (typeof MediaRecorder === 'undefined') return ''
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [supported] = useState(
    () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
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
      setError(err instanceof Error ? err.message : '无法访问麦克风')
      setIsRecording(false)
    }
  }, [supported])

  const stop = useCallback((): Promise<{ blob: Blob; mimeType: string; durationMs: number } | null> => {
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
        const mimeType = mimeTypeRef.current || recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        chunksRef.current = []
        cleanupStream()
        mediaRecorderRef.current = null
        setIsRecording(false)
        if (blob.size < 64) {
          setError('录音太短，请重试。')
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
