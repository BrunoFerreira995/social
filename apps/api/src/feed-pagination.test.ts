import { expect, test } from 'bun:test'
import { paginateFeedRows } from './feed-pagination'

test('carousels occupy one feed position and retain all media', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    post: { id: 'carousel' },
    media: { id: `media-${index}` },
  })).concat([{ post: { id: 'second' }, media: { id: 'second-media' } }])
  const page = paginateFeedRows(rows, 2)
  expect(page.items).toHaveLength(2)
  expect(page.items[0].media).toHaveLength(10)
  expect(page.items[1].post.id).toBe('second')
})

test('cursor points to the last unique post without duplication or loss', () => {
  const rows = [
    { post: { id: 'one' }, media: null },
    { post: { id: 'two' }, media: null },
    { post: { id: 'two' }, media: { id: 'extra' } },
    { post: { id: 'three' }, media: null },
  ]
  const page = paginateFeedRows(rows, 2)
  expect(page.items.map((item) => item.post.id)).toEqual(['one', 'two'])
  expect(page.items[1].media).toHaveLength(1)
  expect(page.hasMore).toBe(true)
  expect(page.nextCursor).toBe('two')
})
