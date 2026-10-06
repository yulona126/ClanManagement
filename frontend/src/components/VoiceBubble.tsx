import { useEffect, useId, useRef, useState } from 'react'
import { resolveMediaUrl } from '../features/media/mediaUrl'

type Props = {
  src: string
  objectKey?: string
  /** Prefer recorded duration (ms) when known; else load from media. */
  durationMs?: number | null
  className?: string
}

const STOP_EVENT = 'claner:voice-stop'

function formatVoiceSeconds(sec: number): string {
  const s = Math.max(1, Math.round(sec))
  return `${s}″`
}

function bubbleWidth(sec: number): number {
  const t = Math.min(60, Math.max(1, sec))
  return 4.5 + (t / 60) * 8.5
}

/**
 * WeChat-style voice bubble: tap to play through to the end; tap again to stop.
 */
export function VoiceBubble({ src, objectKey, durationMs, className }: Props) {
  const url = resolveMediaUrl(src, objectKey)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const idRef = useRef(`vb-${Math.random().toString(36).slice(2)}`)
  const [playing, setPlaying] = useState(false)
  const [durationSec, setDurationSec] = useState(() =>
    durationMs && durationMs > 0 ? durationMs / 1000 : 0,
  )
  const labelId = useId()

  useEffect(() => {
    const audio = new Audio(url)
    audio.preload = 'metadata'
    audioRef.current = audio

    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSec((prev) => (prev > 0 ? prev : audio.duration))
      }
    }
    const onEnded = () => setPlaying(false)
    const onStopOthers = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (detail === idRef.current) return
      audio.pause()
      audio.currentTime = 0
      setPlaying(false)
    }

    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnded)
    window.addEventListener(STOP_EVENT, onStopOthers)

    return () => {
      audio.pause()
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnded)
      window.removeEventListener(STOP_EVENT, onStopOthers)
      audioRef.current = null
    }
  }, [url])

  useEffect(() => {
    if (durationMs && durationMs > 0) {
      setDurationSec(durationMs / 1000)
    }
  }, [durationMs])

  async function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      audio.currentTime = 0
      setPlaying(false)
      return
    }
    window.dispatchEvent(
      new CustomEvent(STOP_EVENT, { detail: idRef.current }),
    )
    try {
      audio.currentTime = 0
      await audio.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }

  const sec = durationSec > 0 ? durationSec : 1
  const widthRem = bubbleWidth(sec)

  return (
    <button
      type="button"
      className={`voice-bubble${playing ? ' is-playing' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: `${widthRem}rem` }}
      onClick={() => void toggle()}
      aria-labelledby={labelId}
      aria-pressed={playing}
    >
      <span className="voice-bubble-icon" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span id={labelId} className="voice-bubble-dur">
        {formatVoiceSeconds(sec)}
      </span>
    </button>
  )
}
