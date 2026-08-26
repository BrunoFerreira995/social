'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CreatePostModal } from './create-post-modal'
import { PushNotifications } from './push-notifications'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem('theme') === 'dark'
    setDark(saved)
    document.documentElement.dataset.theme = saved ? 'dark' : 'light'
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'n' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setModalOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    window.localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <img src="/logo.svg" alt="" width="28" height="28" />
          Lume
        </Link>
        <nav aria-label="Navegação principal">
          <Link href="/feed">Início</Link>
          <Link href="/feed?following=true">Seguindo</Link>
          <Link href="/recommendations">Descobrir</Link>
          <button type="button" onClick={() => setModalOpen(true)}>
            ＋ Criar
          </button>
          <Link href="/notifications">Notificações</Link>
          <Link href="/profile">Perfil</Link>
        </nav>
        <button className="theme-button" type="button" onClick={toggleTheme} aria-label="Alternar tema">
          {dark ? '☀️ Tema claro' : '🌙 Tema escuro'}
        </button>
      </aside>
      <main className="app-content">{children}</main>
      <nav className="bottom-nav" aria-label="Navegação mobile">
        <Link href="/feed" aria-label="Início">
          ⌂
        </Link>
        <Link href="/recommendations" aria-label="Descobrir">
          ✦
        </Link>
        <button type="button" onClick={() => setModalOpen(true)} aria-label="Criar publicação">
          ＋
        </button>
        <Link href="/notifications" aria-label="Notificações">
          ♡
        </Link>
        <Link href="/profile" aria-label="Perfil">
          ◯
        </Link>
      </nav>
      <CreatePostModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <PushNotifications />
    </div>
  )
}
