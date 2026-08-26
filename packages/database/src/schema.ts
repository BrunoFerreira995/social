import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    role: varchar('role', { length: 20 }).default('user').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_unique').on(t.email),
    index('users_deleted_at_idx').on(t.deletedAt),
    check('users_role_check', sql`${t.role} in ('user', 'admin')`),
  ],
)
export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    username: varchar('username', { length: 30 }).notNull(),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    bio: varchar('bio', { length: 160 }),
    websiteUrl: varchar('website_url', { length: 2048 }),
    avatarUrl: text('avatar_url'),
    isPrivate: boolean('is_private').default(false).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('profiles_username_unique').on(t.username)],
)
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('sessions_token_hash_unique').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
)
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('email_verification_user_idx').on(t.userId)],
)
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('password_reset_user_idx').on(t.userId)],
)
export const posts = pgTable(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    caption: text('caption'),
    location: varchar('location', { length: 160 }),
    ...timestamps,
  },
  (t) => [index('posts_feed_idx').on(t.authorId, t.createdAt), index('posts_deleted_at_idx').on(t.deletedAt)],
)
export const postMedia = pgTable(
  'post_media',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    width: integer('width'),
    height: integer('height'),
    position: integer('position').default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    index('post_media_post_idx').on(t.postId, t.position),
    check(
      'post_media_type_check',
      sql`${t.mimeType} in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime')`,
    ),
    check(
      'post_media_dimensions_check',
      sql`(${t.width} is null or ${t.width} > 0) and (${t.height} is null or ${t.height} > 0)`,
    ),
  ],
)
export const postMentions = pgTable(
  'post_mentions',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index('post_mentions_user_idx').on(t.userId)],
)
export const stories = pgTable(
  'stories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaUrl: text('media_url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    width: integer('width'),
    height: integer('height'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index('stories_author_active_idx').on(t.authorId, t.expiresAt),
    index('stories_expiration_idx').on(t.expiresAt),
  ],
)
export const storyViews = pgTable(
  'story_views',
  {
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    viewerId: uuid('viewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.storyId, t.viewerId] }),
    index('story_views_viewer_idx').on(t.viewerId, t.createdAt),
  ],
)
export const conversations = pgTable(
  'conversations',
  { id: uuid('id').defaultRandom().primaryKey(), ...timestamps },
  (t) => [index('conversations_created_idx').on(t.createdAt)],
)
export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index('conversation_members_user_idx').on(t.userId)],
)
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body'),
    mediaUrl: text('media_url'),
    mimeType: varchar('mime_type', { length: 100 }),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('messages_unread_idx').on(t.conversationId, t.readAt),
  ],
)
export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  likes: boolean('likes').default(true).notNull(),
  comments: boolean('comments').default(true).notNull(),
  follows: boolean('follows').default(true).notNull(),
  messages: boolean('messages').default(true).notNull(),
  push: boolean('push').default(false).notNull(),
  updatedAt: timestamps.updatedAt,
})
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_unique').on(t.endpoint),
    index('push_subscriptions_user_idx').on(t.userId),
  ],
)
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): import('drizzle-orm/pg-core').AnyPgColumn => comments.id, {
      onDelete: 'cascade',
    }),
    body: text('body').notNull(),
    ...timestamps,
  },
  (t) => [
    index('comments_post_idx').on(t.postId, t.createdAt),
    check('comments_parent_not_self', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  ],
)
export const likes = pgTable(
  'likes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index('likes_post_idx').on(t.postId)],
)
export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: uuid('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).default('accepted').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index('follows_following_idx').on(t.followingId),
    check('follows_no_self_follow', sql`${t.followerId} <> ${t.followingId}`),
    check('follows_status_check', sql`${t.status} in ('pending', 'accepted')`),
  ],
)
export const savedPosts = pgTable(
  'saved_posts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index('saved_posts_user_idx').on(t.userId, t.createdAt)],
)
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 40 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('notifications_recipient_idx').on(t.recipientId, t.createdAt),
    index('notifications_unread_idx').on(t.recipientId, t.readAt),
    check('notifications_type_check', sql`${t.type} in ('like', 'comment', 'follow', 'message')`),
  ],
)
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'cascade' }),
    targetPostId: uuid('target_post_id').references(() => posts.id, { onDelete: 'cascade' }),
    reason: varchar('reason', { length: 80 }).notNull(),
    status: varchar('status', { length: 20 }).default('open').notNull(),
    ...timestamps,
  },
  (t) => [
    index('reports_status_idx').on(t.status, t.createdAt),
    check('reports_status_check', sql`${t.status} in ('open', 'resolved', 'rejected')`),
    check('reports_exactly_one_target', sql`num_nonnulls(${t.targetUserId}, ${t.targetPostId}) = 1`),
    check('reports_no_self_target', sql`${t.targetUserId} is null or ${t.reporterId} <> ${t.targetUserId}`),
  ],
)
export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index('blocks_blocked_idx').on(t.blockedId),
    check('blocks_no_self_block', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
)
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_idx').on(t.actorId, t.createdAt),
  ],
)
export const schema = {
  users,
  profiles,
  sessions,
  emailVerificationTokens,
  passwordResetTokens,
  posts,
  postMedia,
  postMentions,
  stories,
  storyViews,
  conversations,
  conversationMembers,
  messages,
  notificationPreferences,
  pushSubscriptions,
  comments,
  likes,
  follows,
  savedPosts,
  notifications,
  reports,
  blocks,
  auditLogs,
}
