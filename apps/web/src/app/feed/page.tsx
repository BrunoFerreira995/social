'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

type Media = { id: string; url: string; thumbnailUrl: string | null; mimeType: string }
type FeedItem = {
  post: { id: string; caption: string | null; createdAt: string; likeCount?: number }
  media: Media[]
  liked?: boolean
  likes?: number
}
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const loadingRef = useRef(false)

  async function loadMore() {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    setLoading(true)
    const params = new URLSearchParams({ limit: '12' })
    if (cursor) params.set('cursor', cursor)
    try {
      const response = await fetch(`${apiUrl}/api/v1/feed?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('feed unavailable')
      const data = (await response.json()) as { items: FeedItem[]; nextCursor: string | null; hasMore: boolean }
      setItems((current) => [
        ...current,
        ...data.items.map((item) => ({ ...item, liked: false, likes: item.post.likeCount ?? 0 })),
      ])
      setCursor(data.nextCursor)
      setHasMore(data.hasMore)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMore()
  }, [])
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore()
      },
      { rootMargin: '500px' },
    )
    const target = document.querySelector('#feed-end')
    if (target) observer.observe(target)
    return () => observer.disconnect()
  }, [cursor, hasMore])

  return (
    <main className="feed-shell">
      <header>
        <p className="eyebrow">Lume</p>
        <h1>Seu feed</h1>
      </header>
      <section className="feed-list">
        {items.length === 0 && loading ? (
          <>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </>
        ) : (
          items.map((item) => (
            <article className="post-card" key={item.post.id}>
              <div className="post-media">
                {item.media.map((media) =>
                  media.mimeType.startsWith('video/') ? (
                    <video
                      key={media.id}
                      src={media.url}
                      poster={media.thumbnailUrl ?? undefined}
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <Image
                      key={media.id}
                      src={media.thumbnailUrl ?? media.url}
                      alt="Publicação"
                      width={680}
                      height={680}
                      unoptimized
                    />
                  ),
                )}
              </div>
              <div className="post-actions">
                <button
                  type="button"
                  className={item.liked ? 'liked' : ''}
                  aria-label={item.liked ? 'Remover curtida' : 'Curtir publicação'}
                  onClick={() => void toggleLike(item.post.id)}
                >
                  {item.liked ? '♥' : '♡'} {item.likes ?? 0}
                </button>
              </div>
              <p>{item.post.caption}</p>
              <small>{new Date(item.post.createdAt).toLocaleDateString('pt-BR')}</small>
            </article>
          ))
        )}
        {loading && items.length > 0 && <Skeleton />}
        <div id="feed-end" />
        {!hasMore && items.length > 0 && <p className="end-message">Você chegou ao fim do feed.</p>}
      </section>
    </main>
  )

  async function toggleLike(postId: string) {
    const current = items.find((item) => item.post.id === postId)
    if (!current) return
    const nextLiked = !current.liked
    setItems((items) =>
      items.map((item) =>
        item.post.id === postId ? { ...item, liked: nextLiked, likes: (item.likes ?? 0) + (nextLiked ? 1 : -1) } : item,
      ),
    )
    try {
      const response = await fetch(`${apiUrl}/api/v1/posts/${postId}/like`, {
        method: nextLiked ? 'POST' : 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('like failed')
    } catch {
      setItems((items) =>
        items.map((item) =>
          item.post.id === postId
            ? { ...item, liked: !nextLiked, likes: (item.likes ?? 0) + (nextLiked ? -1 : 1) }
            : item,
        ),
      )
    }
  }
}

function Skeleton() {
  return (
    <div className="skeleton" aria-label="Carregando publicação">
      <div />
      <div />
      <div />
    </div>
  )
}
