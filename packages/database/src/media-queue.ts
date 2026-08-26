import { connectRedis } from './redis'

export type MediaJob = {
  inputPath: string
  outputPath: string
  thumbnailPath: string
  mediaType?: 'image' | 'video'
  variants?: { sm: string; md: string; lg: string }
  width?: number
  height?: number
}

export async function enqueueMediaJob(job: MediaJob) {
  const client = await connectRedis()
  await client.rPush('media:processing', JSON.stringify(job))
}
