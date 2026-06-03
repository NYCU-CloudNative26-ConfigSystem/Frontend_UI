import { expect, seedAuth, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await seedAuth(page)
})

test('snapshot detail tabs work on desktop', async ({ page }) => {
  await page.goto('/config-snapshot/snapshot-003?proj=project-alpha&cmp=acme&env=development')

  await expect(page.getByRole('heading', { name: 'Snapshot details' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Config Entries/ })).toBeVisible()
  await page.getByRole('button', { name: 'Similarity' }).click()
  await expect(page.getByText('No similar configs were found yet.')).toBeVisible()
})

test('snapshot detail tabs stay usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/config-snapshot/snapshot-003?proj=project-alpha&cmp=acme&env=development')

  const tab = page.getByRole('button', { name: 'Similarity' })
  await expect(tab).toBeVisible()
  await tab.click()
  await expect(page.getByText('No similar configs were found yet.')).toBeVisible()
})
