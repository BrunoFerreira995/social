import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

export const databaseConfig = {
  url: process.env.DATABASE_URL ?? 'postgresql://social:social@localhost:5432/social',
} as const

export const sql = postgres(databaseConfig.url, { max: 10, prepare: false })
export const db = drizzle(sql)
export { schema } from './schema'
export { connectRedis, redis } from './redis'
