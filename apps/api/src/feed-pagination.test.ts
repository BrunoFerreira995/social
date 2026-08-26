import { expect, test } from 'bun:test'
import { paginateFeedRows } from './feed-pagination'

test('feed preserves media arrays without nesting', () => {
  const rows = [
    { post: { id: 'carousel' }, media: [{ mimeType: 'image/webp' }, { mimeType: 'image/webp' }] },
    { post: { id: 'second' }, media: [{ mimeType: 'video/mp4' }] },
  ]
  const page = paginateFeedRows(rows, 2)
  expect(page.items).toHaveLength(2)
  expect(page.items[0].media).toEqual([
    expect.objectContaining({ mimeType: 'image/webp' }),
    expect.objectContaining({ mimeType: 'image/webp' }),
  ])
  expect(page.items[1].post.id).toBe('second')
})

test('cursor points to the last unique post without duplication or loss', () => {
  const rows = [
    { post: { id: 'one' }, media: [] },
    { post: { id: 'two' }, media: [] },
    { post: { id: 'three' }, media: [{ id: 'extra' }] },
  ]
  const page = paginateFeedRows(rows, 2)
  expect(page.items.map((item) => item.post.id)).toEqual(['one', 'two'])
  expect(page.items[1].media).toHaveLength(0)
  expect(page.hasMore).toBe(true)
  expect(page.nextCursor).toBe('two')
})
