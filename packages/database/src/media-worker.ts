import { spawn } from 'node:child_process'
import { connectRedis } from './redis'
import type { MediaJob } from './media-queue'
import sharp from 'sharp'

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const process = spawn('ffmpeg', ['-y', ...args])
    process.on('error', reject)
    process.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))))
  })
}

async function processMedia(job: MediaJob) {
  if (job.mediaType === 'image') {
    await sharp(job.inputPath)
      .rotate()
      .resize({ width: 320, height: 320, fit: 'cover' })
      .jpeg({ quality: 82 })
      .toFile(job.thumbnailPath)
    if (job.variants) {
      await Promise.all([
        sharp(job.inputPath)
          .rotate()
          .resize({ width: 640, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(job.variants.sm),
        sharp(job.inputPath)
          .rotate()
          .resize({ width: 1080, withoutEnlargement: true })
          .webp({ quality: 84 })
          .toFile(job.variants.md),
        sharp(job.inputPath)
          .rotate()
          .resize({ width: 2048, withoutEnlargement: true })
          .webp({ quality: 86 })
          .toFile(job.variants.lg),
      ])
    }
    return
  }
  await runFfmpeg([
    '-i',
    job.inputPath,
    '-vf',
    'scale=720:-2',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    job.outputPath,
  ])
  await runFfmpeg(['-i', job.outputPath, '-frames:v', '1', '-q:v', '2', job.thumbnailPath])
}

const redis = await connectRedis()
console.log('Media worker listening on media:processing')
while (true) {
  const item = await redis.blPop('media:processing', 0)
  if (!item) continue
  try {
    await processMedia(JSON.parse(item.element) as MediaJob)
  } catch (error) {
    console.error('Media processing failed', error)
  }
}
