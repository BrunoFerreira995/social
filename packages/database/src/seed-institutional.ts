import { db, sql } from './index'
import { postMedia, posts, profiles, users } from './schema'
import { eq } from 'drizzle-orm'

const [demo] = await db
  .select({ id: users.id })
  .from(users)
  .innerJoin(profiles, eq(profiles.userId, users.id))
  .where(eq(profiles.username, 'demo'))
if (!demo) throw new Error('Execute bun run db:seed antes deste seed')

const institutionalPosts = [
  {
    id: '00000000-0000-0000-0000-000000000101',
    caption:
      'Bem-vindo ao Lume ✨\n\nUm espaço para compartilhar o que importa, descobrir novas ideias e criar conexões com mais intenção.',
    url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1600&q=85',
  },
  {
    id: '00000000-0000-0000-0000-000000000102',
    caption:
      'Aqui, cada história encontra espaço.\n\nPublique seus momentos, acompanhe quem inspira você e participe de uma comunidade feita de interesses reais.',
    url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1600&q=85',
  },
  {
    id: '00000000-0000-0000-0000-000000000103',
    caption:
      'Nossa comunidade cresce com você.\n\nSiga perfis, compartilhe descobertas e ajude a construir uma rede mais humana. #Lume',
    url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&q=85',
  },
]

for (const [index, item] of institutionalPosts.entries()) {
  const inserted = await db
    .insert(posts)
    .values({
      id: item.id,
      authorId: demo.id,
      caption: item.caption,
      location: 'Lume',
      createdAt: new Date(Date.now() - (institutionalPosts.length - index) * 60_000),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: posts.id })
  if (inserted.length)
    await db
      .insert(postMedia)
      .values({ postId: item.id, url: item.url, mimeType: 'image/jpeg', position: 0 })
      .onConflictDoNothing()
}

console.log(`Seed institucional concluído: ${institutionalPosts.length} posts`)
await sql.end()
