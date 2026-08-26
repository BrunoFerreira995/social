'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function HomePage() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const message = await response.text()
        setError(message || 'Não foi possível criar a conta.')
        return
      }

      router.push('/feed')
    } catch {
      setError('Não foi possível conectar à API. Verifique a configuração do servidor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Lume</p>
        <h1>Compartilhe o que importa.</h1>
        <p className="subtitle">Seu espaço para publicar, acompanhar pessoas e construir conexões reais.</p>
        <div className="actions">
          <button type="button" onClick={() => setOpen(true)}>
            Criar conta
          </button>
          <button className="secondary" type="button">
            Entrar
          </button>
        </div>
      </section>
      {open && (
        <div className="auth-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="auth-card" role="dialog" aria-modal="true" aria-labelledby="register-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Fechar" onClick={() => setOpen(false)}>
              ×
            </button>
            <h2 id="register-title">Criar sua conta</h2>
            <p className="auth-description">Comece a compartilhar o que importa.</p>
            <form onSubmit={register}>
              <label htmlFor="register-email">E-mail</label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <label htmlFor="register-password">Senha</label>
              <input
                id="register-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="auth-hint">A senha deve ter pelo menos 8 caracteres.</p>
              {error && <p className="form-status" role="alert">{error}</p>}
              <button type="submit" disabled={loading}>
                {loading ? 'Criando conta…' : 'Criar conta'}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
