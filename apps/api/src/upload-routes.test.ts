import { expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { createUploadRoutes } from './modules/uploads/routes'

const testApp = (authenticated: boolean) =>
  new Elysia().use(
    createUploadRoutes({
      authenticatedUser: async () => (authenticated ? { id: '00000000-0000-0000-0000-000000000001' } : null),
      rateLimit: async () => true,
      mediaDirectory: '/tmp/social-upload-tests',
      mediaBaseUrl: 'http://localhost:3001/uploads',
      storage: {
        createUploadUrl: async () => 'https://storage.test/upload',
        publicMediaUrl: (key) => `https://cdn.test/${key}`,
      },
    }),
  )

test('upload presign rejects anonymous users over HTTP', async () => {
  const response = await testApp(false).handle(
    new Request('http://localhost/api/v1/uploads/presign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: 'photo.jpg', contentType: 'image/jpeg', size: 100 }),
    }),
  )
  expect(response.status).toBe(401)
  expect(await response.text()).toBe('Unauthorized')
})

test('authenticated users receive a presigned upload URL over HTTP', async () => {
  const response = await testApp(true).handle(
    new Request('http://localhost/api/v1/uploads/presign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: 'photo.jpg', contentType: 'image/jpeg', size: 100 }),
    }),
  )
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.uploadUrl).toBe('https://storage.test/upload')
  expect(body.publicUrl.startsWith('https://cdn.test/')).toBe(true)
})
