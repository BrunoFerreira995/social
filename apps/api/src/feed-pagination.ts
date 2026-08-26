export type FeedRow<T> = { post: T; media: unknown }

export function paginateFeedRows<T extends { id: string }>(rows: FeedRow<T>[], limit: number) {
  const unique = new Map<string, { post: T; media: unknown[] }>()
  for (const row of rows) {
    const current = unique.get(row.post.id) ?? { post: row.post, media: [] }
    if (row.media) current.media.push(row.media)
    unique.set(row.post.id, current)
  }
  const posts = [...unique.values()]
  const visible = posts.slice(0, limit)
  return { items: visible, hasMore: posts.length > limit, nextCursor: visible.at(-1)?.post.id ?? null }
}
