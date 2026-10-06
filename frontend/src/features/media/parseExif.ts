import exifr from 'exifr'
import type { ExifPayload } from '../../api/media'

export async function parseImageExif(file: File): Promise<ExifPayload | null> {
  try {
    const data = await exifr.parse(file, {
      gps: true,
      pick: [
        'DateTimeOriginal',
        'CreateDate',
        'ModifyDate',
        'Orientation',
        'Make',
        'Model',
        'ISO',
        'FocalLength',
        'LensModel',
        'Software',
        'ExifImageWidth',
        'ExifImageHeight',
        'ImageWidth',
        'ImageHeight',
      ],
    })
    if (!data || typeof data !== 'object') return null

    const width =
      num(data.ExifImageWidth) ?? num(data.ImageWidth) ?? undefined
    const height =
      num(data.ExifImageHeight) ?? num(data.ImageHeight) ?? undefined

    const taken =
      toIso(data.DateTimeOriginal) ??
      toIso(data.CreateDate) ??
      toIso(data.ModifyDate)

    const orientation = num(data.Orientation)
    const make = str(data.Make)
    const model = str(data.Model)

    let gps: { lat: number; lng: number } | undefined
    const lat = num(data.latitude)
    const lng = num(data.longitude)
    if (lat != null && lng != null) {
      gps = { lat, lng }
    }

    const extra: Record<string, unknown> = {}
    if (data.ISO != null) extra.iso = data.ISO
    if (data.FocalLength != null) extra.focal_length_mm = data.FocalLength
    if (data.LensModel) extra.lens_model = String(data.LensModel)
    if (data.Software) extra.software = String(data.Software)

    const payload: ExifPayload = {}
    if (width) payload.width = width
    if (height) payload.height = height
    if (taken) payload.taken_at = taken
    if (orientation != null) payload.orientation = orientation
    if (make) payload.make = make
    if (model) payload.model = model
    if (gps) payload.gps = gps
    if (Object.keys(extra).length) payload.extra = extra

    return Object.keys(payload).length ? payload : null
  } catch {
    return null
  }
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s || undefined
}

function toIso(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString()
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return undefined
}
