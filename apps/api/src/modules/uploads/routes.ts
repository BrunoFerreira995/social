import { Elysia } from 'elysia'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { validateUpload } from '../../upload-validation'
import { uploadParams, uploadPresignBody } from '../../schemas'

type User = { id: string }
type UploadDependencies = {
  mediaDirectory: string
  mediaBaseUrl: string
  authenticatedUser: (request: Request) => Promise<User | null>
  rateLimit: (key: string, limit?: number) => Promise<boolean>
  storage: {
    createUploadUrl: (key: string, contentType: string) => Promise<string>
    publicMediaUrl: (key: string) => string
  }
}

function uploadError(request: Request, status: number) {
  const code =
    status === 401
      ? 'UNAUTHORIZED'
      : status === 400
        ? 'VALIDATION_ERROR'
        : status === 429
          ? 'RATE_LIMITED'
          : status === 503
            ? 'UNAVAILABLE'
            : status === 404
              ? 'NOT_FOUND'
              : 'REQUEST_ERROR'
  const message =
    status === 401
      ? 'Authentication required'
      : status === 400
        ? 'Invalid request'
        : status === 429
          ? 'Too many requests'
          : status === 503
            ? 'Service unavailable'
            : status === 404
              ? 'Resource not found'
              : 'Request failed'
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  return new Response(JSON.stringify({ code, message, details: [], requestId }), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  })
}

export function createUploadRoutes(deps: UploadDependencies) {
  return new Elysia()
    .get(
      '/uploads/:filename',
      ({ params, request }) => {
        if (!/^[a-zA-Z0-9_.-]+$/.test(params.filename)) return uploadError(request, 400)
        const file = Bun.file(join(deps.mediaDirectory, params.filename))
        return file.size ? new Response(file) : uploadError(request, 404)
      },
      { params: uploadParams },
    )
    .post(
      '/api/v1/uploads/presign',
      async ({ body, request }) => {
        const user = await deps.authenticatedUser(request)
        if (!user) return uploadError(request, 401)
        const accepted = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'video/mp4',
          'video/webm',
          'video/quicktime',
        ]
        const maxSize = body.contentType.startsWith('video/') ? 100 * 1024 * 1024 : 10 * 1024 * 1024
        if (!accepted.includes(body.contentType) || body.size > maxSize) return uploadError(request, 400)
        const extension =
          body.filename
            .split('.')
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, '') || 'bin'
        const key = `users/${user.id}/${randomBytes(16).toString('hex')}.${extension}`
        try {
          return {
            key,
            uploadUrl: await deps.storage.createUploadUrl(key, body.contentType),
            publicUrl: deps.storage.publicMediaUrl(key),
            expiresIn: 900,
          }
        } catch {
          return uploadError(request, 503)
        }
      },
      { body: uploadPresignBody },
    )
    .post('/api/v1/uploads', async ({ request }) => {
      const user = await deps.authenticatedUser(request)
      if (!user) return uploadError(request, 401)
      if (!(await deps.rateLimit(`upload:${user.id}`, 30))) return uploadError(request, 429)
      const file = (await request.formData()).get('file')
      if (!(file instanceof File)) return uploadError(request, 400)
      try {
        const validation = await validateUpload(file)
        await mkdir(deps.mediaDirectory, { recursive: true })
        const id = randomBytes(16).toString('hex')
        const destination = join(deps.mediaDirectory, validation.kind === 'image' ? `${id}.webp` : `${id}.bin`)
        const buffer = await file.arrayBuffer()
        if (validation.kind === 'image') await sharp(buffer).rotate().webp({ quality: 85 }).toFile(destination)
        else await Bun.write(destination, buffer)
        return {
          url: `${deps.mediaBaseUrl}/${destination.split('/').pop()}`,
          mimeType: validation.kind === 'image' ? 'image/webp' : file.type,
          width: validation.metadata?.width,
          height: validation.metadata?.height,
        }
      } catch {
        return uploadError(request, 400)
      }
    })
}
