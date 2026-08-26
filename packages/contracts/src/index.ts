export type UserSummary = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export type ApiError = { code: string; message: string }
