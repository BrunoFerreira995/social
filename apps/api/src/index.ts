import cors from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import webpush from 'web-push'
import sharp from 'sharp'
import { and, count, desc, eq, exists, gt, ilike, inArray, isNull, lt, notExists, or } from 'drizzle-orm'
import { db } from '@social/database'
import { validateUpload } from './upload-validation'
import { createUploadUrl, publicMediaUrl } from './storage'
import {
  blocks,
  comments,
  conversationMembers,
  conversations,
  emailVerificationTokens,
  follows,
  likes,
  messages,
  notificationPreferences,
  notifications,
  passwordResetTokens,
  postMedia,
  postMentions,
  posts,
  profiles,
  pushSubscriptions,
  reports,
  savedPosts,
  sessions,
  stories,
  storyViews,
  users,
} from '@social/database/schema'

const port = Number(process.env.API_PORT ?? 3001)

type AuthBody = { email: string; password: string }
const attempts = new Map<string, { count: number; resetAt: number }>()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const cookieName = 'social_session'
const secureCookies = process.env.NODE_ENV === 'production'
const uploadDirectory = join(process.cwd(), 'uploads')
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
if (vapidPublicKey && vapidPrivateKey)
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@social.local', vapidPublicKey, vapidPrivateKey)

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
function newToken() {
  return randomBytes(32).toString('base64url')
}
function rateLimit(key: string, limit = 10) {
  const now = Date.now()
  const current = attempts.get(key)
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}
function setSessionCookie(set: any, token: string) {
  set.headers['set-cookie'] =
    `${cookieName}=${token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secureCookies ? '; Secure' : ''}`
}
function clearSessionCookie(set: any) {
  set.headers['set-cookie'] =
    `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureCookies ? '; Secure' : ''}`
}
function readCookie(request: Request) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1)
}
async function createSession(userId: string, set: any) {
  const token = newToken()
  await db
    .insert(sessions)
    .values({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 86_400_000) })
  setSessionCookie(set, token)
}
async function notify(recipientId: string, actorId: string, type: string, payload: Record<string, unknown>) {
  if (recipientId === actorId) return
  await db.insert(notifications).values({ recipientId, actorId, type, payload })
  if (!vapidPublicKey || !vapidPrivateKey) return
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, recipientId))
  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({ type, payload }),
        )
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410)
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
      }
    }),
  )
}
async function authenticatedUser(request: Request) {
  const token = readCookie(request)
  if (!token) return null
  const [session] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
  if (!session) return null
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), isNull(users.deletedAt)))
  return user ?? null
}
async function adminUser(request: Request) {
  const user = await authenticatedUser(request)
  return user?.role === 'admin' ? user : null
}
async function canViewPost(postId: string, viewerId?: string) {
  const [post] = await db
    .select({ authorId: posts.authorId, isPrivate: profiles.isPrivate })
    .from(posts)
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
  if (!post) return false
  return canViewAuthor(post.authorId, viewerId, post.isPrivate)
}
async function canViewAuthor(authorId: string, viewerId: string | undefined, isPrivate?: boolean) {
  if (isPrivate === undefined) {
    const [profile] = await db
      .select({ isPrivate: profiles.isPrivate })
      .from(profiles)
      .where(eq(profiles.userId, authorId))
    isPrivate = profile?.isPrivate
  }
  if (!isPrivate || authorId === viewerId) return true
  if (!viewerId) return false
  const [follow] = await db
    .select()
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, authorId), eq(follows.status, 'accepted')))
  return Boolean(follow)
}

export const app = new Elysia()
  .use(cors({ origin: process.env.WEB_URL ?? 'http://localhost:3000', credentials: true }))
  .get('/health', () => ({ status: 'ok', service: 'api' }))
  .get('/uploads/:filename', ({ params }) => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(params.filename)) return new Response('Invalid filename', { status: 400 })
    const file = Bun.file(join(uploadDirectory, params.filename))
    return file.size ? new Response(file) : new Response('File not found', { status: 404 })
  })
  .group('/api/v1', (api) =>
    api
      .get('/status', () => ({ name: 'social-platform', version: '0.1.0' }))
      .post('/uploads/presign', async ({ body, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        const input = body as { filename?: string; contentType?: string; size?: number }
        const accepted = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'video/mp4',
          'video/webm',
          'video/quicktime',
        ]
        const maxSize = input.contentType?.startsWith('video/') ? 100 * 1024 * 1024 : 10 * 1024 * 1024
        if (
          !input.filename ||
          !input.contentType ||
          !accepted.includes(input.contentType) ||
          !input.size ||
          input.size > maxSize
        )
          return new Response('Invalid upload metadata', { status: 400 })
        try {
          const extension =
            input.filename
              .split('.')
              .pop()
              ?.toLowerCase()
              .replace(/[^a-z0-9]/g, '') || 'bin'
          const key = `users/${user.id}/${randomBytes(16).toString('hex')}.${extension}`
          return {
            key,
            uploadUrl: await createUploadUrl(key, input.contentType),
            publicUrl: publicMediaUrl(key),
            expiresIn: 900,
          }
        } catch {
          return new Response('Object storage is not configured', { status: 503 })
        }
      })
      .post('/uploads', async ({ request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        if (!rateLimit(`upload:${user.id}`, 30)) return new Response('Too many uploads', { status: 429 })
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return new Response('File is required', { status: 400 })
        try {
          const validation = await validateUpload(file)
          await mkdir(uploadDirectory, { recursive: true })
          const id = randomBytes(16).toString('hex')
          const buffer = await file.arrayBuffer()
          const filename = validation.kind === 'image' ? `${id}.webp` : `${id}.bin`
          const destination = join(uploadDirectory, filename)
          if (validation.kind === 'image') await sharp(buffer).rotate().webp({ quality: 85 }).toFile(destination)
          else await Bun.write(destination, buffer)
          return {
            url: `${process.env.MEDIA_CDN_URL ?? `http://localhost:${port}/uploads`}/${filename}`,
            mimeType: validation.kind === 'image' ? 'image/webp' : file.type,
            width: validation.metadata?.width,
            height: validation.metadata?.height,
          }
        } catch (error) {
          return new Response(error instanceof Error ? error.message : 'Invalid upload', { status: 400 })
        }
      })
      .post('/auth/register', async ({ body, request, set }) => {
        if (!rateLimit(`register:${request.headers.get('x-forwarded-for') ?? 'unknown'}`, 5))
          return new Response('Too many requests', { status: 429 })
        const input = body as AuthBody
        if (!emailPattern.test(input.email) || input.password.length < 8 || input.password.length > 128)
          return new Response('Invalid credentials', { status: 400 })
        const email = input.email.trim().toLowerCase()
        const passwordHash = await Bun.password.hash(input.password, { algorithm: 'argon2id' })
        try {
          const [user] = await db
            .insert(users)
            .values({ email, passwordHash })
            .returning({ id: users.id, email: users.email })
          await db
            .insert(profiles)
            .values({ userId: user.id, username: `user_${user.id.slice(0, 8)}`, displayName: 'New User' })
          const verificationToken = newToken()
          await db.insert(emailVerificationTokens).values({
            userId: user.id,
            tokenHash: hashToken(verificationToken),
            expiresAt: new Date(Date.now() + 86_400_000),
          })
          if (process.env.NODE_ENV !== 'production')
            console.info(`Email verification token (dev): ${verificationToken}`)
          await createSession(user.id, set)
          return { user }
        } catch {
          return new Response('Email already registered', { status: 409 })
        }
      })
      .post('/auth/login', async ({ body, request, set }) => {
        if (!rateLimit(`login:${request.headers.get('x-forwarded-for') ?? 'unknown'}`, 10))
          return new Response('Too many requests', { status: 429 })
        const input = body as AuthBody
        const [user] = await db
          .select()
          .from(users)
          .where(and(eq(users.email, input.email.trim().toLowerCase()), isNull(users.deletedAt)))
        if (!user?.passwordHash || !(await Bun.password.verify(input.password, user.passwordHash)))
          return new Response('Invalid credentials', { status: 401 })
        await createSession(user.id, set)
        return { user: { id: user.id, email: user.email } }
      })
      .post('/auth/logout', async ({ request, set }) => {
        const token = readCookie(request)
        if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
        clearSessionCookie(set)
        return { success: true }
      })
      .get('/auth/me', async ({ request }) => {
        const user = await authenticatedUser(request)
        return user
          ? { user: { id: user.id, email: user.email, emailVerifiedAt: user.emailVerifiedAt } }
          : new Response('Unauthorized', { status: 401 })
      })
      .post('/auth/verify-email', async ({ body }) => {
        const token = (body as { token?: string }).token
        if (!token) return new Response('Invalid token', { status: 400 })
        const [entry] = await db
          .select()
          .from(emailVerificationTokens)
          .where(
            and(
              eq(emailVerificationTokens.tokenHash, hashToken(token)),
              gt(emailVerificationTokens.expiresAt, new Date()),
            ),
          )
        if (!entry) return new Response('Invalid or expired token', { status: 400 })
        await db
          .update(users)
          .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, entry.userId))
        await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, entry.tokenHash))
        return { success: true }
      })
      .post('/auth/request-password-reset', async ({ body, request }) => {
        if (!rateLimit(`reset:${request.headers.get('x-forwarded-for') ?? 'unknown'}`, 5))
          return new Response('Too many requests', { status: 429 })
        const email = (body as { email?: string }).email?.trim().toLowerCase()
        if (email && emailPattern.test(email)) {
          const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
          if (user) {
            const resetToken = newToken()
            await db.insert(passwordResetTokens).values({
              userId: user.id,
              tokenHash: hashToken(resetToken),
              expiresAt: new Date(Date.now() + 3_600_000),
            })
            if (process.env.NODE_ENV !== 'production') console.info(`Password reset token (dev): ${resetToken}`)
          }
        }
        return { success: true }
      })
      .post('/auth/reset-password', async ({ body }) => {
        const input = body as { token?: string; password?: string }
        if (!input.token || !input.password || input.password.length < 8)
          return new Response('Invalid request', { status: 400 })
        const [entry] = await db
          .select()
          .from(passwordResetTokens)
          .where(
            and(
              eq(passwordResetTokens.tokenHash, hashToken(input.token)),
              gt(passwordResetTokens.expiresAt, new Date()),
            ),
          )
        if (!entry) return new Response('Invalid or expired token', { status: 400 })
        await db
          .update(users)
          .set({
            passwordHash: await Bun.password.hash(input.password, { algorithm: 'argon2id' }),
            updatedAt: new Date(),
          })
          .where(eq(users.id, entry.userId))
        await db.delete(sessions).where(eq(sessions.userId, entry.userId))
        await db.delete(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, entry.tokenHash))
        return { success: true }
      })
      .get('/profiles/:username', async ({ params, request }) => {
        const [profile] = await db
          .select({
            userId: profiles.userId,
            username: profiles.username,
            displayName: profiles.displayName,
            bio: profiles.bio,
            websiteUrl: profiles.websiteUrl,
            avatarUrl: profiles.avatarUrl,
            isPrivate: profiles.isPrivate,
          })
          .from(profiles)
          .innerJoin(users, eq(users.id, profiles.userId))
          .where(and(eq(profiles.username, params.username.toLowerCase()), isNull(users.deletedAt)))
        if (!profile) return new Response('Profile not found', { status: 404 })
        const [[postCount], [followerCount], [followingCount]] = await Promise.all([
          db
            .select({ value: count() })
            .from(posts)
            .where(and(eq(posts.authorId, profile.userId), isNull(posts.deletedAt))),
          db
            .select({ value: count() })
            .from(follows)
            .where(and(eq(follows.followingId, profile.userId), eq(follows.status, 'accepted'))),
          db
            .select({ value: count() })
            .from(follows)
            .where(and(eq(follows.followerId, profile.userId), eq(follows.status, 'accepted'))),
        ])
        const viewer = await authenticatedUser(request)
        const [relationship] = viewer
          ? await db
              .select({ status: follows.status })
              .from(follows)
              .where(and(eq(follows.followerId, viewer.id), eq(follows.followingId, profile.userId)))
          : []
        const [blocked] = viewer
          ? await db
              .select()
              .from(blocks)
              .where(
                or(
                  and(eq(blocks.blockerId, viewer.id), eq(blocks.blockedId, profile.userId)),
                  and(eq(blocks.blockerId, profile.userId), eq(blocks.blockedId, viewer.id)),
                ),
              )
          : []
        if (blocked && viewer?.id !== profile.userId) return new Response('Profile not found', { status: 404 })
        return {
          profile: {
            ...profile,
            counts: { posts: postCount.value, followers: followerCount.value, following: followingCount.value },
            relationship: relationship?.status ?? null,
          },
        }
      })
      .get('/users/search', async ({ query, request }) => {
        const viewer = await authenticatedUser(request)
        if (!viewer) return new Response('Unauthorized', { status: 401 })
        const term = query.q?.trim()
        if (!term || term.length < 2) return { users: [] }
        const usersFound = await db
          .select({
            userId: profiles.userId,
            username: profiles.username,
            displayName: profiles.displayName,
            bio: profiles.bio,
            avatarUrl: profiles.avatarUrl,
            isPrivate: profiles.isPrivate,
          })
          .from(profiles)
          .innerJoin(users, eq(users.id, profiles.userId))
          .where(
            and(
              isNull(users.deletedAt),
              or(ilike(profiles.username, `%${term}%`), ilike(profiles.displayName, `%${term}%`)),
            ),
          )
          .limit(20)
        return { users: usersFound }
      })
      .patch('/profiles/me', async ({ body, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        const input = body as {
          username?: string
          displayName?: string
          bio?: string
          websiteUrl?: string
          avatarUrl?: string
          isPrivate?: boolean
        }
        const username = input.username?.trim().toLowerCase()
        if (username && !/^[a-z0-9_.]{3,30}$/.test(username)) return new Response('Invalid username', { status: 400 })
        if (input.displayName !== undefined && (input.displayName.length < 1 || input.displayName.length > 80))
          return new Response('Invalid display name', { status: 400 })
        try {
          const [profile] = await db
            .update(profiles)
            .set({ ...input, username, updatedAt: new Date() })
            .where(eq(profiles.userId, user.id))
            .returning()
          return { profile }
        } catch {
          return new Response('Username already in use', { status: 409 })
        }
      })
      .post('/profiles/:userId/follow', async ({ params, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        if (user.id === params.userId) return new Response('Cannot follow yourself', { status: 400 })
        const [target] = await db
          .select({ isPrivate: profiles.isPrivate })
          .from(profiles)
          .where(eq(profiles.userId, params.userId))
        if (!target) return new Response('Profile not found', { status: 404 })
        const status = target.isPrivate ? 'pending' : 'accepted'
        await db
          .insert(follows)
          .values({ followerId: user.id, followingId: params.userId, status })
          .onConflictDoUpdate({ target: [follows.followerId, follows.followingId], set: { status } })
        if (status === 'accepted') await notify(params.userId, user.id, 'follow', { followerId: user.id })
        return { following: true, status }
      })
      .delete('/profiles/:userId/follow', async ({ params, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        await db.delete(follows).where(and(eq(follows.followerId, user.id), eq(follows.followingId, params.userId)))
        return { following: false }
      })
      .post('/profiles/:userId/block', async ({ params, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        if (user.id === params.userId) return new Response('Cannot block yourself', { status: 400 })
        await db.insert(blocks).values({ blockerId: user.id, blockedId: params.userId }).onConflictDoNothing()
        await db
          .delete(follows)
          .where(
            or(
              and(eq(follows.followerId, user.id), eq(follows.followingId, params.userId)),
              and(eq(follows.followerId, params.userId), eq(follows.followingId, user.id)),
            ),
          )
        return { blocked: true }
      })
      .delete('/profiles/:userId/block', async ({ params, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        await db.delete(blocks).where(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, params.userId)))
        return { blocked: false }
      })
      .post('/profiles/:userId/report', async ({ params, body, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        const reason = (body as { reason?: string }).reason?.trim()
        if (!reason || reason.length > 80) return new Response('Invalid reason', { status: 400 })
        await db.insert(reports).values({ reporterId: user.id, targetUserId: params.userId, reason })
        return { reported: true }
      })
      .post('/posts/:postId/report', async ({ params, body, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        const reason = (body as { reason?: string }).reason?.trim()
        if (!reason || reason.length > 80) return new Response('Invalid reason', { status: 400 })
        await db.insert(reports).values({ reporterId: user.id, targetPostId: params.postId, reason })
        return { reported: true }
      })
      .post('/posts', async ({ body, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        const input = body as {
          caption?: string
          location?: string
          media?: Array<{ url?: string; thumbnailUrl?: string; mimeType?: string; width?: number; height?: number }>
          mentionUserIds?: string[]
        }
        const media = input.media ?? []
        if (media.length < 1 || media.length > 10)
          return new Response('A post must contain 1 to 10 media items', { status: 400 })
        if (input.caption && input.caption.length > 2_200) return new Response('Caption is too long', { status: 400 })
        if (
          media.some(
            (item) => !item.url || !/^https?:\/\//.test(item.url) || !/^(image|video)\//.test(item.mimeType ?? ''),
          )
        )
          return new Response('Invalid media', { status: 400 })
        const [post] = await db
          .insert(posts)
          .values({
            authorId: user.id,
            caption: input.caption?.trim() || null,
            location: input.location?.trim() || null,
          })
          .returning()
        await db.insert(postMedia).values(
          media.map((item, position) => ({
            postId: post.id,
            url: item.url!,
            thumbnailUrl: item.thumbnailUrl,
            mimeType: item.mimeType!,
            width: item.width,
            height: item.height,
            position,
          })),
        )
        if (input.mentionUserIds?.length)
          await db
            .insert(postMentions)
            .values([...new Set(input.mentionUserIds)].map((userId) => ({ postId: post.id, userId })))
            .onConflictDoNothing()
        return { post: { ...post, media } }
      })
      .get('/posts/:postId', async ({ params, request }) => {
        const viewer = await authenticatedUser(request)
        if (!(await canViewPost(params.postId, viewer?.id))) return new Response('Post not found', { status: 404 })
        const [post] = await db
          .select()
          .from(posts)
          .where(and(eq(posts.id, params.postId), isNull(posts.deletedAt)))
        if (!post) return new Response('Post not found', { status: 404 })
        const media = await db.select().from(postMedia).where(eq(postMedia.postId, post.id))
        const [{ value: likeCount }] = await db.select({ value: count() }).from(likes).where(eq(likes.postId, post.id))
        return { post: { ...post, media, likeCount } }
      })
      .patch('/posts/:postId', async ({ params, body, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        const input = body as { caption?: string; location?: string }
        const [post] = await db
          .select({ authorId: posts.authorId })
          .from(posts)
          .where(and(eq(posts.id, params.postId), isNull(posts.deletedAt)))
        if (!post) return new Response('Post not found', { status: 404 })
        if (post.authorId !== user.id) return new Response('Forbidden', { status: 403 })
        if (input.caption !== undefined && input.caption.length > 2_200)
          return new Response('Caption is too long', { status: 400 })
        await db
          .update(posts)
          .set({
            caption: input.caption?.trim() || null,
            location: input.location?.trim() || null,
            updatedAt: new Date(),
          })
          .where(eq(posts.id, params.postId))
        return { updated: true }
      })
      .delete('/posts/:postId', async ({ params, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        const [post] = await db
          .select({ authorId: posts.authorId })
          .from(posts)
          .where(and(eq(posts.id, params.postId), isNull(posts.deletedAt)))
        if (!post) return new Response('Post not found', { status: 404 })
        if (post.authorId !== user.id) return new Response('Forbidden', { status: 403 })
        await db.update(posts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(posts.id, params.postId))
        return { deleted: true }
      })
      .post('/posts/:postId/like', async ({ params, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        if (!(await canViewPost(params.postId, user.id))) return new Response('Post not found', { status: 404 })
        const [post] = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, params.postId))
        await db.insert(likes).values({ userId: user.id, postId: params.postId }).onConflictDoNothing()
        if (post) await notify(post.authorId, user.id, 'like', { postId: params.postId })
        return { liked: true }
      })
      .delete('/posts/:postId/like', async ({ params, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        if (!(await canViewPost(params.postId, user.id))) return new Response('Post not found', { status: 404 })
        await db.delete(likes).where(and(eq(likes.userId, user.id), eq(likes.postId, params.postId)))
        return { liked: false }
      })
      .post('/posts/:postId/comments', async ({ params, body, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        if (!(await canViewPost(params.postId, user.id))) return new Response('Post not found', { status: 404 })
        const input = body as { body?: string; parentId?: string }
        if (!input.body?.trim() || input.body.length > 2_200) return new Response('Invalid comment', { status: 400 })
        const [comment] = await db
          .insert(comments)
          .values({ postId: params.postId, authorId: user.id, parentId: input.parentId, body: input.body.trim() })
          .returning()
        const [post] = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, params.postId))
        if (post) await notify(post.authorId, user.id, 'comment', { postId: params.postId, commentId: comment.id })
        return { comment }
      })
      .get('/posts/:postId/comments', async ({ params, request }) => {
        if (!(await canViewPost(params.postId, (await authenticatedUser(request))?.id)))
          return new Response('Post not found', { status: 404 })
        return {
          comments: await db
            .select()
            .from(comments)
            .where(and(eq(comments.postId, params.postId), isNull(comments.deletedAt))),
        }
      })
      .post('/posts/:postId/save', async ({ params, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        if (!(await canViewPost(params.postId, user.id))) return new Response('Post not found', { status: 404 })
        await db.insert(savedPosts).values({ userId: user.id, postId: params.postId }).onConflictDoNothing()
        return { saved: true }
      })
      .delete('/posts/:postId/save', async ({ params, request }) => {
        const user = await authenticatedUser(request)
        if (!user) return new Response('Unauthorized', { status: 401 })
        if (!(await canViewPost(params.postId, user.id))) return new Response('Post not found', { status: 404 })
        await db.delete(savedPosts).where(and(eq(savedPosts.userId, user.id), eq(savedPosts.postId, params.postId)))
        return { saved: false }
      })
      .get('/posts/:postId/share', ({ params }) => ({
        url: `${process.env.WEB_URL ?? 'http://localhost:3000'}/post/${params.postId}`,
      })),
  )
  .get('/api/v1/feed', async ({ query, request }) => {
    const viewer = await authenticatedUser(request)
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 50)
    const cursor = query.cursor ? Buffer.from(query.cursor, 'base64url').toString() : null
    const [cursorDate, cursorId] = cursor?.split('|') ?? []
    const conditions = [isNull(posts.deletedAt)]
    if (cursorDate && cursorId)
      conditions.push(
        or(
          lt(posts.createdAt, new Date(cursorDate)),
          and(eq(posts.createdAt, new Date(cursorDate)), lt(posts.id, cursorId)),
        )!,
      )
    if (viewer) {
      conditions.push(
        or(
          eq(profiles.isPrivate, false),
          eq(posts.authorId, viewer.id),
          exists(
            db
              .select()
              .from(follows)
              .where(
                and(
                  eq(follows.followerId, viewer.id),
                  eq(follows.followingId, posts.authorId),
                  eq(follows.status, 'accepted'),
                ),
              ),
          ),
        )!,
      )
      conditions.push(
        notExists(
          db
            .select()
            .from(blocks)
            .where(
              or(
                and(eq(blocks.blockerId, viewer.id), eq(blocks.blockedId, posts.authorId)),
                and(eq(blocks.blockerId, posts.authorId), eq(blocks.blockedId, viewer.id)),
              ),
            ),
        ),
      )
      conditions.push(
        notExists(
          db
            .select()
            .from(reports)
            .where(
              and(eq(reports.reporterId, viewer.id), eq(reports.targetPostId, posts.id), eq(reports.status, 'open')),
            ),
        ),
      )
      if (query.following === 'true')
        conditions.push(
          exists(
            db
              .select()
              .from(follows)
              .where(
                and(
                  eq(follows.followerId, viewer.id),
                  eq(follows.followingId, posts.authorId),
                  eq(follows.status, 'accepted'),
                ),
              ),
          ),
        )
    } else {
      conditions.push(eq(profiles.isPrivate, false))
      if (query.following === 'true') return new Response('Unauthorized', { status: 401 })
    }
    const pagePosts = await db
      .select({ post: posts })
      .from(posts)
      .innerJoin(profiles, eq(profiles.userId, posts.authorId))
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit + 1)
    const hasMore = pagePosts.length > limit
    const visiblePosts = pagePosts.slice(0, limit).map(({ post }) => post)
    const mediaRows = visiblePosts.length
      ? await db
          .select()
          .from(postMedia)
          .where(
            inArray(
              postMedia.postId,
              visiblePosts.map((post) => post.id),
            ),
          )
      : []
    const items = visiblePosts.map((post) => ({ post, media: mediaRows.filter((media) => media.postId === post.id) }))
    const last = items.at(-1)
    return {
      items,
      nextCursor:
        hasMore && last
          ? Buffer.from(`${last.post.createdAt.toISOString()}|${last.post.id}`).toString('base64url')
          : null,
      hasMore,
    }
  })
  .get('/api/v1/recommendations/users', async ({ query, request }) => {
    const viewer = await authenticatedUser(request)
    if (!viewer) return new Response('Unauthorized', { status: 401 })
    const limit = Math.min(Math.max(Number(query.limit ?? 10), 1), 50)
    const [followingRows, blockedRows] = await Promise.all([
      db
        .select({ userId: follows.followingId })
        .from(follows)
        .where(and(eq(follows.followerId, viewer.id), eq(follows.status, 'accepted'))),
      db.select({ userId: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, viewer.id)),
    ])
    const followingIds = followingRows.map((row) => row.userId)
    const excluded = new Set([viewer.id, ...followingIds, ...blockedRows.map((row) => row.userId)])
    const scores = new Map<string, number>()
    if (followingIds.length) {
      const secondDegree = await db
        .select({ userId: follows.followingId })
        .from(follows)
        .where(and(inArray(follows.followerId, followingIds), eq(follows.status, 'accepted')))
      for (const row of secondDegree)
        if (!excluded.has(row.userId)) scores.set(row.userId, (scores.get(row.userId) ?? 0) + 1)
    }
    const candidates = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    let recommendationRows = candidates.length
      ? await db
          .select({
            userId: profiles.userId,
            username: profiles.username,
            displayName: profiles.displayName,
            bio: profiles.bio,
            avatarUrl: profiles.avatarUrl,
            isPrivate: profiles.isPrivate,
          })
          .from(profiles)
          .where(
            inArray(
              profiles.userId,
              candidates.map(([id]) => id),
            ),
          )
      : []
    if (recommendationRows.length < limit) {
      const fallback = await db
        .select({
          userId: profiles.userId,
          username: profiles.username,
          displayName: profiles.displayName,
          bio: profiles.bio,
          avatarUrl: profiles.avatarUrl,
          isPrivate: profiles.isPrivate,
        })
        .from(profiles)
        .limit(limit * 2)
      const existing = new Set(recommendationRows.map((row) => row.userId))
      recommendationRows = [
        ...recommendationRows,
        ...fallback.filter((row) => !excluded.has(row.userId) && !existing.has(row.userId)),
      ].slice(0, limit)
    }
    return {
      recommendations: recommendationRows.map((profile) => ({
        ...profile,
        reason: scores.has(profile.userId) ? 'followed_by_people_you_follow' : 'discover',
      })),
    }
  })
  .post('/api/v1/stories', async ({ body, request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const input = body as {
      mediaUrl?: string
      thumbnailUrl?: string
      mimeType?: string
      width?: number
      height?: number
    }
    if (!input.mediaUrl || !/^https?:\/\//.test(input.mediaUrl) || !/^(image|video)\//.test(input.mimeType ?? ''))
      return new Response('Invalid story media', { status: 400 })
    if (input.mimeType?.startsWith('video/') && input.width && input.height && input.width > input.height)
      return new Response('Stories must be vertical', { status: 400 })
    const mediaUrl = input.mediaUrl as string
    const mimeType = input.mimeType as string
    const [story] = await db
      .insert(stories)
      .values({
        authorId: user.id,
        mediaUrl,
        thumbnailUrl: input.thumbnailUrl,
        mimeType,
        width: input.width,
        height: input.height,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning()
    return { story }
  })
  .get('/api/v1/stories', async ({ request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const activeStories = await db
      .select()
      .from(stories)
      .where(gt(stories.expiresAt, new Date()))
      .orderBy(desc(stories.createdAt))
    const visibleStories = []
    for (const story of activeStories) if (await canViewAuthor(story.authorId, user.id)) visibleStories.push(story)
    return { stories: visibleStories }
  })
  .post('/api/v1/stories/:storyId/view', async ({ params, request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const [story] = await db
      .select({ id: stories.id, authorId: stories.authorId })
      .from(stories)
      .where(and(eq(stories.id, params.storyId), gt(stories.expiresAt, new Date())))
    if (!story) return new Response('Story not found or expired', { status: 404 })
    if (!(await canViewAuthor(story.authorId, user.id)))
      return new Response('Story not found or expired', { status: 404 })
    await db.insert(storyViews).values({ storyId: story.id, viewerId: user.id }).onConflictDoNothing()
    return { viewed: true }
  })
  .post('/api/v1/conversations', async ({ body, request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const memberId = (body as { userId?: string }).userId
    if (!memberId || memberId === user.id) return new Response('Invalid recipient', { status: 400 })
    const [conversation] = await db.insert(conversations).values({}).returning()
    await db.insert(conversationMembers).values([
      { conversationId: conversation.id, userId: user.id },
      { conversationId: conversation.id, userId: memberId },
    ])
    return { conversation }
  })
  .get('/api/v1/conversations', async ({ request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const memberships = await db
      .select({ conversationId: conversationMembers.conversationId, lastReadAt: conversationMembers.lastReadAt })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, user.id))
    return { conversations: memberships }
  })
  .get('/api/v1/conversations/:conversationId/messages', async ({ params, request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const [member] = await db
      .select()
      .from(conversationMembers)
      .where(
        and(eq(conversationMembers.conversationId, params.conversationId), eq(conversationMembers.userId, user.id)),
      )
    if (!member) return new Response('Forbidden', { status: 403 })
    return {
      messages: await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, params.conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(50),
    }
  })
  .post('/api/v1/conversations/:conversationId/messages', async ({ params, body, request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    if (!rateLimit(`message:${user.id}`, 30)) return new Response('Too many messages', { status: 429 })
    const [member] = await db
      .select()
      .from(conversationMembers)
      .where(
        and(eq(conversationMembers.conversationId, params.conversationId), eq(conversationMembers.userId, user.id)),
      )
    if (!member) return new Response('Forbidden', { status: 403 })
    const input = body as { body?: string; mediaUrl?: string; mimeType?: string }
    if ((!input.body?.trim() && !input.mediaUrl) || (input.body && input.body.length > 4_000))
      return new Response('Invalid message', { status: 400 })
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: params.conversationId,
        senderId: user.id,
        body: input.body?.trim(),
        mediaUrl: input.mediaUrl,
        mimeType: input.mimeType,
      })
      .returning()
    return { message }
  })
  .post('/api/v1/conversations/:conversationId/read', async ({ params, request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const now = new Date()
    await db
      .update(conversationMembers)
      .set({ lastReadAt: now })
      .where(
        and(eq(conversationMembers.conversationId, params.conversationId), eq(conversationMembers.userId, user.id)),
      )
    await db
      .update(messages)
      .set({ readAt: now, updatedAt: now })
      .where(and(eq(messages.conversationId, params.conversationId), isNull(messages.readAt)))
    return { read: true }
  })
  .get('/api/v1/notifications', async ({ request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    return {
      notifications: await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.recipientId, user.id), isNull(notifications.deletedAt)))
        .orderBy(desc(notifications.createdAt))
        .limit(50),
    }
  })
  .post('/api/v1/notifications/:notificationId/read', async ({ params, request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    await db
      .update(notifications)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(and(eq(notifications.id, params.notificationId), eq(notifications.recipientId, user.id)))
    return { read: true }
  })
  .get('/api/v1/notification-preferences', async ({ request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const [preferences] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id))
    return { preferences: preferences ?? { likes: true, comments: true, follows: true, messages: true, push: false } }
  })
  .patch('/api/v1/notification-preferences', async ({ body, request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const input = body as { likes?: boolean; comments?: boolean; follows?: boolean; messages?: boolean; push?: boolean }
    const [preferences] = await db
      .insert(notificationPreferences)
      .values({ userId: user.id, ...input })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { ...input, updatedAt: new Date() } })
      .returning()
    return { preferences }
  })
  .get('/api/v1/moderation/reports', async ({ query, request }) => {
    if (!(await adminUser(request))) return new Response('Forbidden', { status: 403 })
    const status = query.status ?? 'open'
    return {
      reports: await db
        .select()
        .from(reports)
        .where(eq(reports.status, status))
        .orderBy(desc(reports.createdAt))
        .limit(100),
    }
  })
  .patch('/api/v1/moderation/reports/:reportId', async ({ params, body, request }) => {
    if (!(await adminUser(request))) return new Response('Forbidden', { status: 403 })
    const input = body as { status?: string; action?: 'remove_post' | 'remove_user' }
    if (!['resolved', 'rejected'].includes(input.status ?? ''))
      return new Response('Invalid moderation status', { status: 400 })
    const [report] = await db.select().from(reports).where(eq(reports.id, params.reportId))
    if (!report) return new Response('Report not found', { status: 404 })
    if (input.action === 'remove_post' && report.targetPostId)
      await db
        .update(posts)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(posts.id, report.targetPostId))
    if (input.action === 'remove_user' && report.targetUserId)
      await db
        .update(users)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, report.targetUserId))
    await db.update(reports).set({ status: input.status, updatedAt: new Date() }).where(eq(reports.id, report.id))
    return { moderated: true }
  })
  .get('/api/v1/push/public-key', () =>
    vapidPublicKey ? { publicKey: vapidPublicKey } : new Response('Push not configured', { status: 503 }),
  )
  .post('/api/v1/push/subscribe', async ({ body, request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const input = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    if (!vapidPublicKey || !input.endpoint || !input.keys?.p256dh || !input.keys.auth)
      return new Response('Invalid push subscription', { status: 400 })
    await db
      .insert(pushSubscriptions)
      .values({ userId: user.id, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh: input.keys.p256dh, auth: input.keys.auth, updatedAt: new Date() },
      })
    await db
      .insert(notificationPreferences)
      .values({ userId: user.id, push: true })
      .onConflictDoUpdate({ target: notificationPreferences.userId, set: { push: true, updatedAt: new Date() } })
    return { subscribed: true }
  })
  .delete('/api/v1/push/subscribe', async ({ body, request }) => {
    const user = await authenticatedUser(request)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const endpoint = (body as { endpoint?: string }).endpoint
    if (endpoint)
      await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)))
    return { subscribed: false }
  })

if (import.meta.main) {
  app.listen(port)
  console.log(`API running at http://localhost:${port}`)
  const websocketPort = Number(process.env.WS_PORT ?? 3002)
  Bun.serve({
    port: websocketPort,
    fetch(request, server) {
      if (server.upgrade(request)) return
      return new Response('WebSocket endpoint', { status: 426 })
    },
    websocket: {
      message(socket, message) {
        socket.send(JSON.stringify({ type: 'ack', message }))
      },
    },
  })
  console.log(`WebSocket running at ws://localhost:${websocketPort}`)
}
