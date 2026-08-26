import { t } from 'elysia'

export const uuid = t.String({ format: 'uuid' })
export const url = t.String({ format: 'uri', maxLength: 2_048 })
export const mimeType = t.Union([
  t.Literal('image/jpeg'),
  t.Literal('image/png'),
  t.Literal('image/webp'),
  t.Literal('image/gif'),
  t.Literal('video/mp4'),
  t.Literal('video/webm'),
  t.Literal('video/quicktime'),
])
export const cursor = t.Optional(t.String({ pattern: '^[A-Za-z0-9_-]{1,512}$' }))
export const limit = t.Optional(t.Integer({ minimum: 1, maximum: 50, default: 20 }))

export const authBody = t.Object({
  email: t.String({ format: 'email', maxLength: 320 }),
  password: t.String({ minLength: 8, maxLength: 128 }),
})
export const tokenBody = t.Object({ token: t.String({ minLength: 16, maxLength: 256 }) })
export const emailBody = t.Object({ email: t.String({ format: 'email', maxLength: 320 }) })
export const passwordResetBody = t.Object({
  token: t.String({ minLength: 16, maxLength: 256 }),
  password: t.String({ minLength: 8, maxLength: 128 }),
})
export const userIdBody = t.Object({ userId: uuid })
export const reasonBody = t.Object({ reason: t.String({ minLength: 1, maxLength: 80 }) })
export const profileBody = t.Object({
  username: t.Optional(t.String({ pattern: '^[a-z0-9_.]{3,30}$' })),
  displayName: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
  bio: t.Optional(t.String({ maxLength: 2_200 })),
  websiteUrl: t.Optional(url),
  avatarUrl: t.Optional(url),
  isPrivate: t.Optional(t.Boolean()),
})
export const postBody = t.Object({
  caption: t.Optional(t.String({ maxLength: 2_200 })),
  location: t.Optional(t.String({ maxLength: 200 })),
  media: t.Array(
    t.Object({
      url,
      thumbnailUrl: t.Optional(url),
      mimeType,
      width: t.Optional(t.Integer({ minimum: 1, maximum: 20_000 })),
      height: t.Optional(t.Integer({ minimum: 1, maximum: 20_000 })),
    }),
    { minItems: 1, maxItems: 10 },
  ),
  mentionUserIds: t.Optional(t.Array(uuid, { maxItems: 50 })),
})
export const captionBody = t.Object({
  caption: t.Optional(t.String({ maxLength: 2_200 })),
  location: t.Optional(t.String({ maxLength: 200 })),
})
export const commentBody = t.Object({ body: t.String({ minLength: 1, maxLength: 2_200 }), parentId: t.Optional(uuid) })
export const storyBody = t.Object({
  mediaUrl: url,
  thumbnailUrl: t.Optional(url),
  mimeType,
  width: t.Optional(t.Integer({ minimum: 1, maximum: 20_000 })),
  height: t.Optional(t.Integer({ minimum: 1, maximum: 20_000 })),
})
export const messageBody = t.Object({
  body: t.Optional(t.String({ maxLength: 4_000 })),
  mediaUrl: t.Optional(url),
  mimeType: t.Optional(mimeType),
})
export const notificationPreferencesBody = t.Object({
  likes: t.Optional(t.Boolean()),
  comments: t.Optional(t.Boolean()),
  follows: t.Optional(t.Boolean()),
  messages: t.Optional(t.Boolean()),
  push: t.Optional(t.Boolean()),
})
export const moderationBody = t.Object({
  status: t.Union([t.Literal('resolved'), t.Literal('rejected')]),
  action: t.Optional(t.Union([t.Literal('remove_post'), t.Literal('remove_user')])),
})
export const pushSubscriptionBody = t.Object({
  endpoint: url,
  keys: t.Object({ p256dh: t.String({ minLength: 16 }), auth: t.String({ minLength: 8 }) }),
})
export const endpointBody = t.Object({ endpoint: url })

export const postParams = t.Object({ postId: uuid })
export const userParams = t.Object({ userId: uuid })
export const storyParams = t.Object({ storyId: uuid })
export const conversationParams = t.Object({ conversationId: uuid })
export const notificationParams = t.Object({ notificationId: uuid })
export const reportParams = t.Object({ reportId: uuid })
export const feedQuery = t.Object({
  cursor,
  limit,
  following: t.Optional(t.Union([t.Literal('true'), t.Literal('false')])),
})
export const recommendationQuery = t.Object({ limit })
export const searchQuery = t.Object({ q: t.Optional(t.String({ minLength: 2, maxLength: 80 })) })
export const profileParams = t.Object({ username: t.String({ pattern: '^[a-z0-9_.]{3,30}$' }) })
export const moderationQuery = t.Object({
  status: t.Optional(t.Union([t.Literal('open'), t.Literal('resolved'), t.Literal('rejected')])),
})
export const uploadPresignBody = t.Object({
  filename: t.String({ minLength: 1, maxLength: 255, pattern: '^[a-zA-Z0-9_.-]+$' }),
  contentType: mimeType,
  size: t.Integer({ minimum: 1, maximum: 100 * 1024 * 1024 }),
})
export const uploadParams = t.Object({ filename: t.String({ pattern: '^[a-zA-Z0-9_.-]+$', maxLength: 255 }) })
