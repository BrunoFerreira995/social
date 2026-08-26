import { expect, test } from 'bun:test'
import { app } from './index'

test('health endpoint is public', async () => {
  const response = await app.handle(new Request('http://localhost/health'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok', service: 'api' })
})

test('protected endpoints reject anonymous users', async () => {
  const response = await app.handle(new Request('http://localhost/api/v1/auth/me'))
  expect(response.status).toBe(401)
})
