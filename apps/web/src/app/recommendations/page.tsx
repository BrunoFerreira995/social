import Link from 'next/link'

export default function RecommendationsPage() {
  return (
    <main className="feed-shell">
      <p className="eyebrow">Descobrir</p>
      <h1>Encontre novas conexões</h1>
      <p className="subtitle">As recomendações são personalizadas com base nas pessoas que você segue.</p>
      <p>
        <Link href="/feed">Voltar ao feed</Link>
      </p>
    </main>
  )
}
