import { db, sql } from './index'
import { profiles, users } from './schema'

const email = 'demo@social.local'
const [user] = await db.insert(users).values({ email }).onConflictDoNothing().returning()
if (user)
  await db
    .insert(profiles)
    .values({ userId: user.id, username: 'demo', displayName: 'Demo User' })
    .onConflictDoNothing()
console.log(user ? `Seed concluído: ${email}` : `Seed já existente: ${email}`)
await sql.end()
