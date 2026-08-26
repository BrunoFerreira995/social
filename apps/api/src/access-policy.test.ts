import { describe, expect, test } from 'bun:test'
import { canInteractWithContent, canMutateContent, canViewContent } from './access-policy'

const base = { ownerId: 'owner', isPrivate: false as boolean }

describe('content access policy', () => {
  test.each([
    ['anonymous visitor sees public content', { ...base }, true],
    ['anonymous visitor cannot see private content', { ...base, isPrivate: true }, false],
    ['private profile owner sees own content', { ...base, isPrivate: true, viewerId: 'owner' }, true],
    [
      'accepted follower sees private content',
      { ...base, isPrivate: true, viewerId: 'follower', relationship: 'accepted' as const },
      true,
    ],
    [
      'pending follower cannot see private content',
      { ...base, isPrivate: true, viewerId: 'follower', relationship: 'pending' as const },
      false,
    ],
    ['blocked user is denied in either direction', { ...base, viewerId: 'follower', blockedByViewer: true }, false],
    ['user who blocked the viewer is denied', { ...base, viewerId: 'follower', blockedViewer: true }, false],
  ])('%s', (_, context, expected) => expect(canViewContent(context)).toBe(expected))

  test('likes and saves use the same visibility rule', () => {
    const context = { ...base, isPrivate: true, viewerId: 'follower', relationship: 'pending' as const }
    expect(canInteractWithContent(context)).toBe(false)
  })

  test('only the owner can mutate content', () => {
    expect(canMutateContent('owner', 'owner')).toBe(true)
    expect(canMutateContent('owner', 'other')).toBe(false)
    expect(canMutateContent('owner')).toBe(false)
  })
})
