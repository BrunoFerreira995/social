import sharp from 'sharp'

export const uploadLimits = { image: 10 * 1024 * 1024, video: 100 * 1024 * 1024 } as const
const allowedImages = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const allowedVideos = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

function startsWithBytes(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value)
}

export async function validateUpload(file: File) {
  const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null
  if (!kind || !(kind === 'image' ? allowedImages : allowedVideos).has(file.type))
    throw new Error('Unsupported file type')
  if (file.size === 0 || file.size > uploadLimits[kind])
    throw new Error(`File exceeds ${uploadLimits[kind] / 1024 / 1024}MB limit`)
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (kind === 'image') {
    if (
      !startsWithBytes(bytes, [0xff, 0xd8, 0xff]) &&
      !startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47]) &&
      !startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46])
    )
      throw new Error('Invalid image signature')
    const metadata = await sharp(await file.arrayBuffer()).metadata()
    if (!metadata.width || !metadata.height || metadata.width > 10_000 || metadata.height > 10_000)
      throw new Error('Invalid image dimensions')
    return { kind, metadata }
  }
  const isMp4 = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  const isWebm = startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])
  if (!isMp4 && !isWebm) throw new Error('Invalid video signature')
  return { kind, metadata: undefined }
}
