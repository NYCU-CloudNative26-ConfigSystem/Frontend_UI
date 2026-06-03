import { expect, seedAuth, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await seedAuth(page)
})

test('home navigation cards reach their pages', async ({ page }) => {
  await page.goto('/home')

  await page.getByRole('link', { name: /About Me/ }).click()
  await expect(page).toHaveURL(/\/about-me$/)
  await expect(page.getByRole('heading', { name: 'Justin Reviewer' })).toBeVisible()

  await page.goto('/home')
  await page.getByRole('link', { name: /Search Configs/ }).click()
  await expect(page).toHaveURL(/\/config-search$/)
  await expect(page.getByLabel('Search')).toBeVisible()

  await page.goto('/home')
  await page.getByRole('link', { name: /Pending Review/ }).click()
  await expect(page).toHaveURL(/\/review-pending$/)
  await expect(page.getByRole('heading', { name: 'All pending review snapshots' })).toBeVisible()
})

test('project display segmented control switches modes', async ({ page }) => {
  await page.goto('/projects')

  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  await page.getByRole('button', { name: 'Badge' }).click()
  await expect(page.getByText(/4 companies/)).toBeVisible()

  await page.getByRole('button', { name: 'Collapsible' }).click()
  await expect(page.getByText(/companies/)).toBeVisible()
})

test('config manager segmented controls are reachable', async ({ page }) => {
  await page.goto('/config?proj=project-alpha')

  await expect(page.getByText('Project Alpha')).toBeVisible()
  await page.getByRole('button', { name: 'Companies' }).click()
  await expect(page.getByText('Company display:')).toBeVisible()
  await page.getByRole('button', { name: 'Badge' }).click()
  await expect(page.getByText(/companies/)).toBeVisible()
})
