import { app, authenticatedUser } from './app'
import { and, eq } from 'drizzle-orm'
import { db } from '@social/database'
import { conversationMembers } from '@social/database/schema'

const port = Number(process.env.API_PORT ?? 3001)
app.listen(port)
console.log(`API running at http://localhost:${port}`)

// Vercel invokes the HTTP server as a function. The separate WebSocket
// listener is only supported by the long-running local/server deployment.
if (!process.env.VERCEL) {
  const websocketPort = Number(process.env.WS_PORT ?? 3002)
  Bun.serve<{ userId: string }>({
  port: websocketPort,
  async fetch(request, server) {
    const user = await authenticatedUser(request)
    if (!user)
      return new Response(
        JSON.stringify({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          details: [],
          requestId: crypto.randomUUID(),
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      )
    if (server.upgrade(request, { data: { userId: user.id } })) return
    return new Response('WebSocket endpoint', { status: 426 })
  },
  websocket: {
    async message(socket, message): Promise<void> {
      let payload: { conversationId?: string }
      try {
        payload = JSON.parse(String(message)) as { conversationId?: string }
      } catch {
        socket.send(JSON.stringify({ code: 'VALIDATION_ERROR', message: 'Invalid JSON' }))
        return
      }
      if (!payload.conversationId) {
        socket.send(JSON.stringify({ code: 'VALIDATION_ERROR', message: 'conversationId is required' }))
        return
      }
      const member = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, payload.conversationId),
            eq(conversationMembers.userId, socket.data.userId),
          ),
        )
      if (!member.length) {
        socket.send(JSON.stringify({ code: 'FORBIDDEN', message: 'Conversation access denied' }))
        return
      }
      socket.send(JSON.stringify({ type: 'ack', conversationId: payload.conversationId }))
    },
  },
  })
  console.log(`WebSocket running at ws://localhost:${websocketPort}`)
}
