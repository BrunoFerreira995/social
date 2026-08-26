'use client'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function PushNotifications() {
  return (
    <button className="push-button" type="button" onClick={() => void enablePush()}>
      🔔 Ativar notificações
    </button>
  )
}

async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission === 'denied') return
  const registration = await navigator.serviceWorker.register('/sw.js')
  const keyResponse = await fetch(`${apiUrl}/api/v1/push/public-key`, { credentials: 'include' })
  if (!keyResponse.ok) return
  if (Notification.permission === 'default') await Notification.requestPermission()
  if (Notification.permission !== 'granted') return
  const { publicKey } = (await keyResponse.json()) as { publicKey: string }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  await fetch(`${apiUrl}/api/v1/push/subscribe`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  })
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}
