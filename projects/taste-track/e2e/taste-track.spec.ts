import { expect, test } from '@playwright/test';

const movieUrl = '/movies/the-last-algorithm';
const showUrl = '/tv/only-mergers';

test('lands on movies and follows a typed catalog link', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/movies/);
  await expect(page.getByRole('heading', { name: 'Movies', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('Fellowship');
  await page.getByRole('link', { name: 'The Fellowship of the Spreadsheet', exact: true }).click();
  await expect(page).toHaveURL(/\/movies\/fellowship-of-the-spreadsheet/);
  await expect(
    page.getByRole('heading', { name: 'The Fellowship of the Spreadsheet' }),
  ).toBeVisible();
});

test('restores catalog chips, sorting, and pagination from the URL', async ({ page }) => {
  await page.goto('/movies?pageSize=12&sort=year%3Adesc');
  await expect(page.locator('app-media-card')).toHaveCount(12);
  await expect(page.locator('app-media-card').first()).toContainText('Picture 26');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole('button', { name: 'Drama', exact: true }).click();
  await expect(page).toHaveURL(/genres=Drama/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Drama', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Page 1', { exact: true })).toBeVisible();
});

test('navigates show → season → episode and reloads the exact episode', async ({ page }) => {
  await page.goto(showUrl);
  await page
    .getByRole('navigation', { name: 'Seasons' })
    .getByRole('link', { name: 'Season 2', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Only Mergers in the Building · Season 2' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Browse episodes' }).click();
  await expect(page.locator('app-media-card')).toHaveCount(4);
  await page.getByRole('link', { name: 'The Callback', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${showUrl}/s/2/e/1`));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The Callback', exact: true })).toBeVisible();
  await expect(
    page.getByText('Only Mergers in the Building · Season 2, episode 1', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Credits', exact: true }).click();
  await expect(page).toHaveURL(/#credits$/);
  await page.getByRole('link', { name: 'Signal House Studios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Signal House Studios' })).toBeVisible();
  await page.getByRole('link', { name: 'Only Mergers in the Building', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${showUrl}\\?pageSize=24$`));
});

test('people profiles show actual credits and link to movies', async ({ page }) => {
  await page.goto('/people');
  await page.getByRole('link', { name: 'Wes Andersonville', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Filmography' })).toBeVisible();
  await page.getByRole('link', { name: 'The Last Algorithm', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${movieUrl}\\?pageSize=24$`));
});

test('restores Signal Forms and writes array and structured query values', async ({ page }) => {
  await page.goto('/library?search=algorithm&pageSize=12&sort=rating%3Adesc');
  await expect(page.getByRole('searchbox', { name: 'Search library' })).toHaveValue('algorithm');
  await expect(page.getByText('The Last Algorithm', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'movie', exact: true }).click();
  await page.getByRole('button', { name: 'show', exact: true }).click();
  await expect(page).toHaveURL(/media=movie(?:%2C|,)show/);
  await page.getByLabel('Viewing count').selectOption('countless');
  await expect(page).toHaveURL(/replayCount=countless/);
  await page.reload();
  await expect(page.getByLabel('Viewing count')).toHaveValue('countless');
  await expect(page.getByRole('button', { name: 'movie', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('persists ratings and viewings, filters history, and resets the database', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.locator('#main-content').getByRole('button', { name: 'dark', exact: true }).click();
  await page.goto(movieUrl);
  await page.getByRole('combobox', { name: 'Rating', exact: true }).selectOption('9');
  await page.getByLabel('Viewing date').fill('2026-09-09');
  await page.getByRole('button', { name: 'Log viewing' }).click();
  await expect(page.getByRole('status')).toHaveText('Viewing saved.');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Rating', exact: true })).toHaveValue('9');
  await expect(page.getByRole('heading', { name: '3 recorded viewings' })).toBeVisible();
  await page.getByRole('link', { name: 'View history for The Last Algorithm' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search history' })).toHaveValue(
    'The Last Algorithm',
  );
  await expect(page.locator('.history-list article')).toHaveCount(3);
  await page.getByLabel('From', { exact: true }).fill('2026-09-01');
  await expect(page.locator('.history-list article')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search history' }).fill('no such title');
  await expect(page).toHaveURL(/search=no%20such%20title/);
  await expect(page.locator('.history-list article')).toHaveCount(0);
  await page.goto('/settings');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset TasteTrack' }).click();
  await expect(page).toHaveURL(/\/movies/);
  await page.goto(movieUrl);
  await expect(page.getByRole('combobox', { name: 'Rating', exact: true })).toHaveValue('6');
  await expect(page.getByRole('heading', { name: '2 recorded viewings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('unknown paths and missing entities have useful empty states', async ({ page }) => {
  await page.goto('/music');
  await expect(
    page.getByRole('heading', { name: 'This page isn’t in the catalog.' }),
  ).toBeVisible();
  await page.goto(`${showUrl}/s/99`);
  await expect(page.getByRole('heading', { name: 'Title not found' })).toBeVisible();
});

test('restores library select values and browser back/forward state', async ({ page }) => {
  await page.goto('/library?minRating=9&pageSize=48&sort=rating%3Adesc');
  await expect(page.getByRole('combobox', { name: 'Minimum rating', exact: true })).toHaveValue(
    '9',
  );
  await expect(page.getByRole('combobox', { name: 'Page size', exact: true })).toHaveValue('48');
  await expect(page.locator('app-media-card .rating').first()).toBeVisible();
  const ratings = await page.locator('app-media-card .rating').allTextContents();
  expect(ratings.length).toBeGreaterThan(0);
  expect(ratings.every((rating) => /(?:9|10)\/10/.test(rating))).toBe(true);
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: /History/ })
    .click();
  await page.getByRole('searchbox', { name: 'Search history' }).fill('algorithm');
  await expect(page).toHaveURL(/search=algorithm/);
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Minimum rating', exact: true })).toHaveValue(
    '9',
  );
  await page.goForward();
  await expect(page.getByRole('searchbox', { name: 'Search history' })).toHaveValue('algorithm');
});

test('browser back cancels a staged search instead of replaying it on forward', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/library');
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: /History/ })
    .click();
  const search = page.getByRole('searchbox', { name: 'Search history' });
  // Start the input and history change in one browser task, before debounce emits the value.
  await search.evaluate((element: HTMLInputElement) => {
    element.value = 'stale';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    history.back();
  });
  await expect(page).toHaveURL(/\/library\?pageSize=24$/);
  await expect(page.getByRole('searchbox', { name: 'Search library' })).toBeVisible();
  await page.goForward();
  await expect(search).toHaveValue('');
  await page.clock.runFor(300);
  await expect(page).not.toHaveURL(/search=stale/);
  await expect(search).toHaveValue('');
});

test('uses the landing redirect without losing query filters', async ({ page }) => {
  await page.goto('/?search=algorithm&pageSize=12');
  await expect(page).toHaveURL(/\/movies\?search=algorithm&pageSize=12$/);
  await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toHaveValue(
    'algorithm',
  );
  await expect(page.locator('app-media-card')).toHaveCount(1);
});

test('holds short library searches and resets the page when the search writes', async ({
  page,
}) => {
  await page.goto('/library?pageSize=12&page=2');
  const search = page.getByRole('searchbox', { name: 'Search library' });

  await search.pressSequentially('al');
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/library\?pageSize=12&page=2$/);

  await search.pressSequentially('g');
  await expect(page).toHaveURL(/\/library\?pageSize=12&search=alg$/);
  await expect(page.getByText('Page 1', { exact: true })).toBeVisible();

  await search.fill('');
  await expect(page).toHaveURL(/\/library\?pageSize=12$/);
});

test('remembers the page size across lists and reloads', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await page.goto('/settings');
  await nav.getByRole('link', { name: /Browse/ }).click();
  await expect(page).toHaveURL(/\/movies\?pageSize=24$/);
  await page.getByRole('combobox', { name: 'Page size', exact: true }).selectOption('12');
  await expect(page).toHaveURL(/pageSize=12/);
  await nav.getByRole('link', { name: /Library/ }).click();
  await expect(page).toHaveURL(/\/library\?pageSize=12$/);
  await nav.getByRole('link', { name: /Browse/ }).click();
  await expect(page).toHaveURL(/\/movies\?pageSize=12$/);
  // The restoring redirect adds no history entry of its own.
  await page.goBack();
  await expect(page).toHaveURL(/\/library\?pageSize=12$/);
  await page.goto('/movies');
  await expect(page).toHaveURL(/\/movies\?pageSize=12$/);
  await expect(page.locator('app-media-card')).toHaveCount(12);
});

test('opens the last season of a show from a URL without the season', async ({ page }) => {
  const seasons = page.getByRole('navigation', { name: 'Seasons' });
  // With no season stored for this show, the URL falls back to the show page.
  await page.goto(`${showUrl}/s`);
  await expect(page).toHaveURL(new RegExp(`${showUrl}\\?pageSize=24$`));
  await seasons.getByRole('link', { name: 'Season 2', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${showUrl}/s/2\\?pageSize=24$`));
  await expect(
    page.getByRole('heading', { name: 'Only Mergers in the Building · Season 2' }),
  ).toBeVisible();
  await page.goto(`${showUrl}/s?pageSize=12#episodes`);
  await expect(page).toHaveURL(new RegExp(`${showUrl}/s/2\\?pageSize=12#episodes$`));
  await expect(
    page.getByRole('heading', { name: 'Only Mergers in the Building · Season 2' }),
  ).toBeVisible();
  // Each show remembers its own season.
  await page.goto('/tv/stranger-strings/s');
  await expect(page).toHaveURL(/\/tv\/stranger-strings\?pageSize=12$/);
});

test('resetting TasteTrack forgets the remembered page size', async ({ page }) => {
  await page.goto('/movies?pageSize=12');
  await expect(page.locator('app-media-card')).toHaveCount(12);
  await page.goto('/settings');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset TasteTrack' }).click();
  await expect(page).toHaveURL(/\/movies\?pageSize=24$/);
});
