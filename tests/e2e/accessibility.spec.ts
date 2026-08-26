import { expect, test } from '@playwright/test'

test('home has no obvious missing image alternatives', async ({ page }) => {
  await page.goto('/')
  const images = page.locator('img')
  for (let index = 0; index < (await images.count()); index += 1) await expect(images.nth(index)).toHaveAttribute('alt')
})
