import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db, sql } from '@social/database'
import { profiles, users } from '@social/database/schema'

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

  test('migrations enforce self-follow and exactly one report target', async () => {
    const result =
      await sql`select conname from pg_constraint where conname in ('follows_no_self_follow', 'reports_exactly_one_target')`
    expect(result.length).toBe(2)
  })
})
