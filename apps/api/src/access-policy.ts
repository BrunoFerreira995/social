export type AccessContext = {
  ownerId: string
  viewerId?: string
  isPrivate: boolean
  relationship?: 'accepted' | 'pending' | null
  blockedByViewer?: boolean
  blockedViewer?: boolean
}

export function canViewContent(context: AccessContext) {
  if (context.blockedByViewer || context.blockedViewer) return false
  if (!context.isPrivate) return true
  return Boolean(context.viewerId && (context.viewerId === context.ownerId || context.relationship === 'accepted'))
}

export function canInteractWithContent(context: AccessContext) {
  return canViewContent(context)
}
export function canMutateContent(ownerId: string, viewerId?: string) {
  return Boolean(viewerId && ownerId === viewerId)
}
