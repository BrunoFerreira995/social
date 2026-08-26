import { Elysia } from 'elysia'
import { join } from 'node:path'
import { baseApp, authenticatedUser, rateLimit } from './index'
import { createUploadRoutes } from './modules/uploads/routes'
import { createUploadUrl, publicMediaUrl } from './storage'

const mediaDirectory = join(process.cwd(), 'uploads')
const apiPort = Number(process.env.API_PORT ?? 3001)

/** Application composition entrypoint. Domain plugins are registered here. */
export const app = new Elysia().use(baseApp).use(
  createUploadRoutes({
    authenticatedUser,
    rateLimit,
    mediaDirectory,
    mediaBaseUrl: process.env.MEDIA_CDN_URL ?? `http://localhost:${apiPort}/uploads`,
    storage: { createUploadUrl, publicMediaUrl },
  }),
)

export { authenticatedUser }
