import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from '@playwright/test'

const baseUrl = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3000'
const outputDirectory = process.env.SCREENSHOT_OUTPUT ?? './artifacts/screenshots'

await mkdir(outputDirectory, { recursive: true })
const browser = await chromium.launch({ headless: true })

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${outputDirectory}/${name}.png`, fullPage: true })
  console.log(`Captured ${name}.png`)
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
await desktop.goto(baseUrl, { waitUntil: 'networkidle' })
await capture(desktop, '01-home-desktop')
await desktop.goto(`${baseUrl}/feed`, { waitUntil: 'networkidle' })
await capture(desktop, '02-feed-desktop')
await desktop.getByRole('button', { name: /criar/i }).first().click()
await capture(desktop, '03-create-modal-desktop')
await desktop.keyboard.press('Escape')
await desktop.locator('.theme-button').click()
await capture(desktop, '04-feed-dark-desktop')
await desktop.goto(`${baseUrl}/recommendations`, { waitUntil: 'networkidle' })
await capture(desktop, '05-recommendations-desktop')
await desktop.close()

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })
await mobile.goto(baseUrl, { waitUntil: 'networkidle' })
await capture(mobile, '06-home-mobile')
await mobile.goto(`${baseUrl}/feed`, { waitUntil: 'networkidle' })
await capture(mobile, '07-feed-mobile')
await mobile.getByRole('button', { name: /criar publicação/i }).click()
await capture(mobile, '08-create-modal-mobile')
await mobile.close()

await browser.close()
console.log(`Screenshots saved in ${outputDirectory}`)
