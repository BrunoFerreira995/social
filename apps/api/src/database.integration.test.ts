import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, sql } from '@social/database'
import { comments, postMedia, posts, profiles, reports, sessions, users } from '@social/database/schema'
import { app } from './app'

const enabled = Boolean(process.env.DATABASE_URL)

describe.skipIf(!enabled)('PostgreSQL transaction integration', () => {
  test('rolls back user and profile when a later operation fails', async () => {
    const email = `rollback-${crypto.randomUUID()}@test.local`
    await expect(
      db.transaction(async (tx) => {
        const [user] = await tx.insert(users).values({ email }).returning({ id: users.id })
        await tx
          .insert(profiles)
          .values({ userId: user.id, username: `rollback_${user.id.slice(0, 8)}`, displayName: 'Rollback' })
        throw new Error('simulated failure')
      }),
    ).rejects.toThrow('simulated failure')

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    expect(user).toBeUndefined()
  })

  test('migrations enforce self-follow and report constraints', async () => {
    const result =
      await sql`select conname from pg_constraint where conname in ('follows_no_self_follow', 'reports_exactly_one_target', 'reports_no_self_target')`
    expect(result.length).toBe(3)
  })

  test('accepts user and post reports, rejecting self and multiple targets', async () => {
    const [reporter, target] = await db
      .insert(users)
      .values([
        { email: `reporter-${crypto.randomUUID()}@test.local` },
        { email: `target-${crypto.randomUUID()}@test.local` },
      ])
      .returning({ id: users.id })
    const [post] = await db.insert(posts).values({ authorId: target.id }).returning({ id: posts.id })
    try {
      await db.insert(reports).values({ reporterId: reporter.id, targetUserId: target.id, reason: 'spam' })
      await db.insert(reports).values({ reporterId: reporter.id, targetPostId: post.id, reason: 'spam' })
      await expect(
        db.insert(reports).values({ reporterId: reporter.id, targetUserId: reporter.id, reason: 'self' }),
      ).rejects.toThrow()
      await expect(
        db
          .insert(reports)
          .values({ reporterId: reporter.id, targetUserId: target.id, targetPostId: post.id, reason: 'two targets' }),
      ).rejects.toThrow()
    } finally {
      await db.delete(users).where(eq(users.id, reporter.id))
      await db.delete(users).where(eq(users.id, target.id))
    }
  })

  test('enforces comment parent FK and positive media dimensions', async () => {
    const [author] = await db
      .insert(users)
      .values({ email: `constraints-${crypto.randomUUID()}@test.local` })
      .returning({ id: users.id })
    const [post] = await db.insert(posts).values({ authorId: author.id }).returning({ id: posts.id })
    try {
      await expect(
        db
          .insert(comments)
          .values({ postId: post.id, authorId: author.id, parentId: crypto.randomUUID(), body: 'orphan' }),
      ).rejects.toThrow()
      await expect(
        db
          .insert(postMedia)
          .values({ postId: post.id, url: 'https://cdn.test/image.webp', mimeType: 'image/webp', width: -1 }),
      ).rejects.toThrow()
      await db
        .insert(postMedia)
        .values({ postId: post.id, url: 'https://cdn.test/image.webp', mimeType: 'image/webp', width: 100 })
    } finally {
      await db.delete(users).where(eq(users.id, author.id))
    }
  })

  test('paginates the real feed route without nesting carousel media', async () => {
    const token = `feed-${crypto.randomUUID()}`
    const [author] = await db
      .insert(users)
      .values({ email: `${token}@test.local` })
      .returning({ id: users.id })
    await db
      .insert(profiles)
      .values({ userId: author.id, username: `feed_${author.id.slice(0, 8)}`, displayName: 'Feed' })
    const [first] = await db.insert(posts).values({ authorId: author.id }).returning({ id: posts.id })
    await db.insert(postMedia).values([
      { postId: first.id, url: 'https://cdn.test/one.webp', mimeType: 'image/webp', position: 0 },
      { postId: first.id, url: 'https://cdn.test/two.webp', mimeType: 'image/webp', position: 1 },
    ])
    const [second] = await db
      .insert(posts)
      .values({ authorId: author.id, createdAt: new Date(Date.now() - 60_000) })
      .returning({ id: posts.id })
    await db.insert(sessions).values({
      userId: author.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
    })
    try {
      const firstResponse = await app.handle(
        new Request('http://localhost/api/v1/feed?limit=1', { headers: { cookie: `social_session=${token}` } }),
      )
      expect(firstResponse.status).toBe(200)
      const firstBody = await firstResponse.json()
      const carousel = firstBody.items.find((item: { post: { id: string } }) => item.post.id === first.id)
      expect(carousel.media).toEqual([
        expect.objectContaining({ position: 0, url: 'https://cdn.test/one.webp' }),
        expect.objectContaining({ position: 1, url: 'https://cdn.test/two.webp' }),
      ])
      expect(firstBody.nextCursor).toBeTruthy()
      const secondResponse = await app.handle(
        new Request(`http://localhost/api/v1/feed?limit=1&cursor=${firstBody.nextCursor}`, {
          headers: { cookie: `social_session=${token}` },
        }),
      )
      const secondBody = await secondResponse.json()
      expect(secondBody.items).toHaveLength(1)
      expect(secondBody.items[0].post.id).toBe(second.id)
    } finally {
      await db.delete(users).where(eq(users.id, author.id))
    }
  })
})
