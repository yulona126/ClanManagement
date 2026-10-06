import axios from 'axios'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from '../auth/tokens'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? ''

export const api = axios.create({
  baseURL,
  // Local media PUT + complete can exceed 10s behind Tunnel.
  timeout: 60_000,
})

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refresh = getRefreshToken()
  if (!refresh) {
    throw new Error('No refresh token')
  }
  const { data } = await axios.post<{ access: string }>(
    `${baseURL}/api/auth/refresh/`,
    { refresh },
  )
  const access = data.access
  setTokens(access, refresh)
  return access
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) {
      throw error
    }

    const status = error.response?.status
    const original = error.config as typeof error.config & { _retry?: boolean }

    if (status !== 401 || original._retry) {
      throw error
    }

    if (original.url?.includes('/api/auth/login/')) {
      throw error
    }

    original._retry = true

    try {
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null
      })
      const access = await refreshPromise
      original.headers.Authorization = `Bearer ${access}`
      return api.request(original)
    } catch {
      clearTokens()
      throw error
    }
  },
)
