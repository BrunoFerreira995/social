import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db, sql } from '@social/database'
import { comments, postMedia, posts, profiles, reports, users } from '@social/database/schema'

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
})
