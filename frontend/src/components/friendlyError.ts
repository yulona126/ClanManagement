import axios from 'axios'

/** 用户可读的错误摘要（避免整段 JSON 砸脸） */
export function friendlyError(err: unknown, fallback = '操作失败，请稍后重试'): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    if (status === 401) return '登录已过期，请重新登录'
    if (status === 403) return '没有权限执行此操作'
    if (status === 404) return '内容不存在或已删除'
    if (status === 502 || status === 503) return '服务暂时不可用，请确认后端已启动'
    if (!err.response) return '网络异常，请检查连接'
    const data = err.response.data
    if (typeof data === 'string' && data.trim()) return data.slice(0, 200)
    if (data && typeof data === 'object') {
      const detail = (data as { detail?: unknown }).detail
      if (typeof detail === 'string') return detail
      const nonField = (data as { non_field_errors?: string[] }).non_field_errors
      if (Array.isArray(nonField) && nonField[0]) return String(nonField[0])
      const first = Object.values(data as Record<string, unknown>).find(
        (v) => typeof v === 'string' || (Array.isArray(v) && v[0]),
      )
      if (typeof first === 'string') return first
      if (Array.isArray(first) && first[0]) return String(first[0])
    }
    return err.message || fallback
  }
  if (err instanceof Error) return err.message
  return fallback
}
