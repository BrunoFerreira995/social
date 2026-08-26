import { expect, test } from '@playwright/test'

test('home renders the Lume brand', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Lume')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Criar conta' })).toBeVisible()
})
