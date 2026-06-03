import { expect, test } from './fixtures'

test('redirects authenticated pages to login when there is no token', async ({ page }) => {
  await page.goto('/home')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Welcome back!' })).toBeVisible()
})

test('logs in and lands on home', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username or Email').fill('justin@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByText('Config System')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pending review' })).toBeVisible()
})
