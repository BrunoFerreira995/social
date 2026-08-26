import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { AppShell } from '../components/app-shell'

export const metadata: Metadata = {
  title: 'Lume — Compartilhe o que importa',
  description: 'Uma nova forma de compartilhar o que importa.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-theme="light">
      <body>
        <AppShell>{children}</AppShell>
        <Analytics />
      </body>
    </html>
  )
}
