export type FeedRow<TPost, TMedia> = { post: TPost; media: TMedia[] }

export function paginateFeedRows<TPost extends { id: string }, TMedia>(rows: FeedRow<TPost, TMedia>[], limit: number) {
  const items = rows.slice(0, limit)
  return { items, hasMore: rows.length > limit, nextCursor: items.at(-1)?.post.id ?? null }
}
