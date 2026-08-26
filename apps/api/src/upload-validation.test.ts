import { expect, test } from 'bun:test'
import { validateUpload } from './upload-validation'

test('rejects unsupported file types', async () => {
  await expect(validateUpload(new File(['hello'], 'payload.txt', { type: 'text/plain' }))).rejects.toThrow(
    'Unsupported file type',
  )
})

test('rejects oversized files before processing', async () => {
  const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' })
  await expect(validateUpload(file)).rejects.toThrow('exceeds')
})
