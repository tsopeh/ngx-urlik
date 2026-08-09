import { expect, test } from '@playwright/test';

test('opens the dashboard and follows a typed catalog link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good taste leaves a trail.' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: /Screen$/ })
    .click();
  await expect(page).toHaveURL(/\/screen\/movies/);
  await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible();
  await page.getByRole('link', { name: 'The Fellowship of the Spreadsheet', exact: true }).click();
  await expect(page).toHaveURL(/\/screen\/movies\/movie\/mov_fellowship-of-the-spreadsheet/);
  await expect(
    page.getByRole('heading', { name: 'The Fellowship of the Spreadsheet' }),
  ).toBeVisible();
});

test('uses the URL as the source of truth for catalog chips', async ({ page }) => {
  await page.goto('/screen/movies');
  await page.getByRole('button', { name: 'Drama', exact: true }).click();
  await expect(page).toHaveURL(/genres=Drama/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Drama', exact: true })).toHaveClass(/selected/);
});

test('persists an explicit theme across reloads', async ({ page }) => {
  await page.goto('/settings');
  await page.locator('#main-content').getByRole('button', { name: 'dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('restores collection filters from a deep link', async ({ page }) => {
  await page.goto('/collection?search=algorithm&page=1&pageSize=12&sort=rating%3Adesc');
  await expect(page.getByRole('searchbox', { name: 'Search collection' })).toHaveValue('algorithm');
  await expect(page.getByText('The Last Algorithm', { exact: true })).toBeVisible();
});
