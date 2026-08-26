import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const bucket = process.env.S3_BUCKET
const cdnUrl = process.env.MEDIA_CDN_URL
const client = new S3Client({
  region: process.env.S3_REGION ?? 'auto',
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  credentials:
    process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
      : undefined,
})
export async function createUploadUrl(key: string, contentType: string) {
  if (!bucket) throw new Error('Object storage is not configured')
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
    expiresIn: 900,
  })
}
export function publicMediaUrl(key: string) {
  return cdnUrl ? `${cdnUrl.replace(/\/$/, '')}/${key}` : key
}
