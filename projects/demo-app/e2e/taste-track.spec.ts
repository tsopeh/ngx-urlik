import { expect, test } from '@playwright/test';

const movieUrl = '/movies/quillons-last-inference';
const showUrl = '/tv/brambleworth-manor';

test('lands on movies and follows a typed catalog link', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/movies/);
  await expect(page.getByRole('heading', { name: 'Movies', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('Nine Cells');
  await page.getByRole('link', { name: 'Nine Cells and a Formula', exact: true }).click();
  await expect(page).toHaveURL(/\/movies\/nine-cells-and-a-formula/);
  await expect(page.getByRole('heading', { name: 'Nine Cells and a Formula' })).toBeVisible();
});

test('restores catalog chips, sorting, and pagination from the URL', async ({ page }) => {
  await page.goto('/movies?pageSize=12&sort=year%3Adesc');
  await expect(page.locator('app-media-card')).toHaveCount(12);
  await expect(page.locator('app-media-card').first()).toContainText('Recursion Street');
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
  await expect(page.getByRole('heading', { name: 'Brambleworth Manor · Season 2' })).toBeVisible();
  await page.getByRole('link', { name: 'Browse episodes' }).click();
  await expect(page.locator('app-media-card')).toHaveCount(6);
  await page.getByRole('link', { name: 'The Callback Nobody Returned', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${showUrl}/s/2/e/1`));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'The Callback Nobody Returned', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Brambleworth Manor · Season 2, episode 1', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Credits', exact: true }).click();
  await expect(page).toHaveURL(/#credits$/);
  await page.getByRole('link', { name: 'Quarrybell Studios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quarrybell Studios' })).toBeVisible();
  await page.getByRole('link', { name: 'Brambleworth Manor', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${showUrl}$`));
});

test('keeps Browse highlighted on movie and TV pages', async ({ page }) => {
  const browse = page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: /Browse/ });
  await page.goto('/movies');
  await expect(browse).toHaveAttribute('aria-current', 'page');
  await page.goto(`${showUrl}/s/2/e`);
  await expect(browse).toHaveAttribute('aria-current', 'page');
  await page.goto('/library');
  await expect(browse).not.toHaveAttribute('aria-current');
});

test('switching catalogs never shows a false empty result', async ({ page }) => {
  // Record every empty-state message the page ever renders, even for one frame.
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { seenEmpty: seen });
    new MutationObserver(() => {
      for (const empty of document.querySelectorAll('.empty')) {
        seen.push(empty.textContent ?? '');
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/movies');
  await expect(page.locator('app-media-card').first()).toBeVisible();
  await page.getByRole('link', { name: 'TV shows', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'TV shows', exact: true })).toBeVisible();
  await expect(page.locator('app-media-card').first()).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { seenEmpty: string[] }).seenEmpty),
  ).toEqual([]);
});

test('people profiles show actual credits and link to movies', async ({ page }) => {
  await page.goto('/people');
  await page.getByRole('link', { name: 'Wendell Marchbank', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Filmography' })).toBeVisible();
  await page.getByRole('link', { name: "Quillon's Last Inference", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${movieUrl}$`));
});

test('restores Signal Forms and writes array and structured query values', async ({ page }) => {
  await page.goto('/library?search=inference&pageSize=12&sort=rating%3Adesc');
  await expect(page.getByRole('searchbox', { name: 'Search library' })).toHaveValue('inference');
  await expect(page.getByText("Quillon's Last Inference", { exact: true })).toBeVisible();
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
  await page.getByRole('link', { name: "View history for Quillon's Last Inference" }).click();
  await expect(page.getByRole('searchbox', { name: 'Search history' })).toHaveValue(
    "Quillon's Last Inference",
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
  await page.getByRole('searchbox', { name: 'Search history' }).fill('inference');
  await expect(page).toHaveURL(/search=inference/);
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Minimum rating', exact: true })).toHaveValue(
    '9',
  );
  await page.goForward();
  await expect(page.getByRole('searchbox', { name: 'Search history' })).toHaveValue('inference');
});

test('leaving the page with Back drops a pending debounced search', async ({ page }) => {
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
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('searchbox', { name: 'Search library' })).toBeVisible();
  await page.goForward();
  await expect(search).toHaveValue('');
  await page.clock.runFor(300);
  await expect(page).not.toHaveURL(/search=stale/);
  await expect(search).toHaveValue('');
});

test('uses the landing redirect without losing query filters', async ({ page }) => {
  await page.goto('/?search=inference&pageSize=12');
  await expect(page).toHaveURL(/\/movies\?search=inference&pageSize=12$/);
  await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toHaveValue(
    'inference',
  );
  await expect(page.locator('app-media-card')).toHaveCount(1);
});

test('holds short library searches and resets the page when the search writes', async ({
  page,
}) => {
  await page.goto('/library?pageSize=12&page=2');
  const search = page.getByRole('searchbox', { name: 'Search library' });

  const total = page.getByRole('heading', { name: /collected titles$/ });
  const cards = page.locator('app-media-card');
  await expect(cards).not.toHaveCount(0);
  const before = { total: await total.textContent(), cards: await cards.count() };

  await search.pressSequentially('al');
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/library\?pageSize=12&page=2$/);
  // The list shows the URL, not the held draft.
  expect({ total: await total.textContent(), cards: await cards.count() }).toEqual(before);

  await search.pressSequentially('g');
  await expect(page).toHaveURL(/\/library\?pageSize=12&search=alg$/);
  await expect(page.getByText('Page 1', { exact: true })).toBeVisible();

  await search.fill('');
  await expect(page).toHaveURL(/\/library\?pageSize=12$/);
});

test('keeps the library page when a held search is deleted', async ({ page }) => {
  await page.goto('/library?pageSize=12&page=2');
  const search = page.getByRole('searchbox', { name: 'Search library' });
  await expect(page.locator('app-media-card')).not.toHaveCount(0);

  await search.pressSequentially('a');
  await page.waitForTimeout(500);
  await search.fill('');
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/library\?pageSize=12&page=2$/);
  await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
});

test('shows only the error when the journal fails to open', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }));
  await page.goto('/movies');

  await expect(page.getByRole('alert')).toHaveText(/Could not open your journal/);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
});

test('section links keep the catalog filters', async ({ page }) => {
  await page.goto('/movies/quillons-last-inference?genres=Drama');
  await page.getByRole('link', { name: 'Credits', exact: true }).click();
  await expect(page).toHaveURL(/\/movies\/quillons-last-inference\?genres=Drama#credits$/);
});

test('a double-clicked favorite ends where it started', async ({ page }) => {
  await page.goto('/movies?pageSize=12');
  const favorite = () =>
    page
      .locator('app-media-card')
      .first()
      .getByRole('button', { name: /favorite$/ });
  await expect(favorite()).toHaveAccessibleName('Add favorite');

  await favorite().dblclick();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(favorite()).toHaveAccessibleName('Add favorite');

  // One click still adds it, so the double click above toggled twice.
  await favorite().click();
  await expect(favorite()).toHaveAccessibleName('Remove favorite');
  await page.reload();
  await expect(favorite()).toHaveAccessibleName('Remove favorite');
});

test("rejects a viewing date the journal can't store", async ({ page }) => {
  await page.goto(movieUrl);
  const viewings = page.getByRole('heading', { name: /recorded viewings$/ });
  await expect(viewings).toHaveText('2 recorded viewings');
  const date = page.getByLabel('Viewing date');
  // A date input accepts years past 9999. Typing one more digit in the year gives this value.
  await date.evaluate((input: HTMLInputElement) => {
    input.value = '20261-11-11';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(date).toHaveValue('20261-11-11');

  await page.getByRole('button', { name: 'Log viewing' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a date like 2026-11-11.');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(viewings).toHaveText('2 recorded viewings');
});

test('opens lists at the page size picked last, also in a new tab', async ({ page, context }) => {
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  const pageSize = page.getByRole('combobox', { name: 'Page size', exact: true });
  await page.goto('/movies');
  await pageSize.selectOption('12');
  await expect(page).toHaveURL(/pageSize=12/);
  await nav.getByRole('link', { name: /Library/ }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(pageSize).toHaveValue('12');
  const tab = await context.newPage();
  await tab.goto('/');
  await expect(tab).toHaveURL(/\/movies$/);
  await expect(tab.locator('app-media-card')).toHaveCount(12);
  // A size in the URL wins, and becomes the one picked last.
  await page.goto('/history?pageSize=48');
  await expect(pageSize).toHaveValue('48');
  await page.goto('/library');
  await expect(pageSize).toHaveValue('48');
});

test('continues a show at the season it was last opened at', async ({ page }) => {
  const resume = page.getByRole('link', { name: /^Continue with Season/ });
  await page.goto(showUrl);
  await expect(resume).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Seasons' })
    .getByRole('link', { name: 'Season 2', exact: true })
    .click();
  await page.getByRole('link', { name: 'Back to show', exact: true }).click();
  await resume.click();
  await expect(page).toHaveURL(new RegExp(`${showUrl}/s/2$`));
  await page.goto('/tv/wirefern');
  await expect(resume).toHaveCount(0);
});

test('resetting TasteTrack returns to the movie catalog', async ({ page }) => {
  await page.goto('/settings');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset TasteTrack' }).click();
  await expect(page).toHaveURL(/\/movies$/);
});

test('removes a cleared History date from the URL', async ({ page }) => {
  await page.goto('/history');
  const from = page.getByLabel('From', { exact: true });
  await from.fill('2026-09-01');
  await expect(page).toHaveURL(/from=2026-09-01/);
  await from.fill('');
  await expect(page).not.toHaveURL(/from=/);
});

test.describe('east of UTC+4', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('shows a viewing on the day it was logged', async ({ page }) => {
    await page.goto(movieUrl);
    await page.getByLabel('Viewing date').fill('2026-09-09');
    await page.getByRole('button', { name: 'Log viewing' }).click();
    await expect(page.getByRole('status')).toHaveText('Viewing saved.');
    await page.goto('/history?from=2026-09-09&to=2026-09-09');
    await expect(page.locator('.history-list article time')).toHaveText('Sep 9, 2026');
  });
});

test.describe('late in the evening west of UTC', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('the viewing date starts at the local date', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-15T23:30:00-05:00'));
    await page.goto(movieUrl);
    await expect(page.getByLabel('Viewing date')).toHaveValue('2026-11-15');
  });
});

test('a bad remembered season leaves the show page working', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.addInitScript(() =>
    localStorage.setItem('taste-track:seasons', JSON.stringify({ 'tv_brambleworth-manor': 0 })),
  );
  await page.goto(showUrl);
  await expect(
    page.getByRole('heading', { name: 'Brambleworth Manor', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /^Continue with Season/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('writes a typed catalog search to the URL once, not per keystroke', async ({ page }) => {
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.assign(window, { writes });
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history);
      history[method] = (data, unused, url) => {
        writes.push(String(url));
        original(data, unused, url);
      };
    }
  });
  await page.goto('/movies?pageSize=12&page=2');
  const search = page.getByRole('searchbox', { name: 'Search', exact: true });
  await expect(page.locator('app-media-card')).not.toHaveCount(0);

  await search.pressSequentially('nine cells', { delay: 50 });
  await expect(page).toHaveURL(/\/movies\?pageSize=12&search=nine%20cells$/);
  await expect(page.locator('app-media-card')).toHaveCount(1);
  const writes = await page.evaluate(() => (window as unknown as { writes: string[] }).writes);
  expect(writes.filter((url) => url.includes('search='))).toHaveLength(1);
});

test('runs where the browser blocks storage', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    }),
  );
  await page.goto('/movies');
  await expect(page.getByRole('heading', { name: 'Movies', exact: true })).toBeVisible();
  await expect(page.locator('app-media-card').first()).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: /Settings/ })
    .click();
  await page.locator('#main-content').getByRole('button', { name: 'dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/movies?pageSize=12');
  await expect(page.locator('app-media-card')).toHaveCount(12);
  expect(errors).toEqual([]);
});
