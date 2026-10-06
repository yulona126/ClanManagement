import { api } from './client'

export type LoginPayload = {
  username: string
  password: string
}

export type TokenPair = {
  access: string
  refresh: string
}

export type MeResponse = {
  id: number
  username: string
  email: string
  is_staff: boolean
  display_name: string
  bio: string
  avatar_url: string
}

export async function login(payload: LoginPayload): Promise<TokenPair> {
  const { data } = await api.post<TokenPair>('/api/auth/login/', payload)
  return data
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>('/api/auth/me/')
  return data
}

export async function patchMe(payload: {
  display_name?: string
  bio?: string
  email?: string
}): Promise<MeResponse> {
  const { data } = await api.patch<MeResponse>('/api/auth/me/', payload)
  return data
}

export async function uploadMyAvatar(file: File): Promise<MeResponse> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<MeResponse>('/api/auth/me/avatar/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
