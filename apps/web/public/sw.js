self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { type: 'notification', payload: {} }
  event.waitUntil(
    self.registration.showNotification('Social Platform', {
      body: data.payload?.message ?? `Nova atividade: ${data.type}`,
      icon: '/icon-192.png',
      data: data.payload,
    }),
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/notifications'))
})
