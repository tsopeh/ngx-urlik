import { expect, type Page, test } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Movies', exact: true }).click();
  await page.getByRole('button', { name: 'Shows', exact: true }).click();
  await expect(page).toHaveURL(/media=movie(?:%2C|,)show/);
  await page.getByLabel('Viewing count').selectOption('countless');
  await expect(page).toHaveURL(/replayCount=countless/);
  await page.reload();
  await expect(page.getByLabel('Viewing count')).toHaveValue('countless');
  await expect(page.getByRole('button', { name: 'Movies', exact: true })).toHaveAttribute(
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
  await expect(page.getByRole('status').filter({ hasText: 'Viewing saved.' })).toBeVisible();
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

test('section links scroll to their section and keep the catalog filters', async ({ page }) => {
  await page.goto('/movies/quillons-last-inference?genres=Drama');
  const credits = page.locator('#credits');
  await expect(credits).not.toBeInViewport();
  await page.getByRole('link', { name: 'Credits', exact: true }).click();
  await expect(page).toHaveURL(/\/movies\/quillons-last-inference\?genres=Drama#credits$/);
  await expect(credits).toBeInViewport();
});

test('opens a detail page at the section in its URL', async ({ page }) => {
  await page.goto(`${movieUrl}#history`);
  const history = page.locator('#history');
  await expect(history).toBeInViewport();
  // The section lists the newest viewings, newest first.
  await expect(history.locator('time')).toHaveText([/^Jul \d+, 2026$/, /^Jun \d+, 2026$/]);
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
  await expect(page.getByRole('status').filter({ hasText: 'Viewing saved.' })).toHaveCount(0);
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
    await expect(page.getByRole('status').filter({ hasText: 'Viewing saved.' })).toBeVisible();
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

// Records every URL the app writes to the browser history, and returns a function that reads them.
async function recordUrlWrites(page: Page) {
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
  return () => page.evaluate(() => (window as unknown as { writes: string[] }).writes);
}

test('writes a typed catalog search to the URL once, not per keystroke', async ({ page }) => {
  const urlWrites = await recordUrlWrites(page);
  await page.goto('/movies?pageSize=12&page=2');
  const search = page.getByRole('searchbox', { name: 'Search', exact: true });
  await expect(page.locator('app-media-card')).not.toHaveCount(0);

  await search.pressSequentially('nine cells', { delay: 50 });
  await expect(page).toHaveURL(/\/movies\?pageSize=12&search=nine%20cells$/);
  await expect(page.locator('app-media-card')).toHaveCount(1);
  const writes = await urlWrites();
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

// Records every loading indicator the page shows, even for one frame, since an answer can arrive
// within 150 ms.
async function watchLoading(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { seenLoading: seen });
    new MutationObserver(() => {
      for (const status of document.querySelectorAll('[role="status"]')) {
        if (status.textContent?.includes('Loading')) {
          seen.push(location.pathname);
        }
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { seenLoading: string[] }).seenLoading);
}

test('shows a loading indicator until a page has its data', async ({ page }) => {
  const seenLoading = await watchLoading(page);
  const pages = [
    ['/movies', page.locator('app-media-card').first()],
    ['/library', page.locator('app-media-card').first()],
    ['/history', page.locator('.history-list article').first()],
    [movieUrl, page.getByRole('heading', { name: "Quillon's Last Inference" })],
    ['/people', page.getByRole('link', { name: /Wendell/ })],
    ['/people/wendell', page.getByRole('heading', { name: 'Filmography' })],
  ] as const;
  for (const [url, loaded] of pages) {
    await page.goto(url);
    await expect(loaded).toBeVisible();
    expect(await seenLoading(), url).toContain(url);
    await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toHaveCount(0);
  }
});

test('dims the results while they reload', async ({ page }) => {
  const seenLoading = await watchLoading(page);
  await page.goto('/movies');
  const grid = page.locator('.media-grid');
  await expect(page.locator('app-media-card').first()).toBeVisible();
  await expect(grid).toHaveAttribute('aria-busy', 'false');

  // Count the cards each time the grid turns busy: the last results stay while the next load.
  await grid.evaluate((element) => {
    const counts: number[] = [];
    Object.assign(window, { busyCards: counts });
    new MutationObserver(() => {
      if (element.getAttribute('aria-busy') === 'true') {
        counts.push(element.querySelectorAll('app-media-card').length);
      }
    }).observe(element, { attributes: true });
  });
  const before = (await seenLoading()).length;
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('year');
  await expect.poll(async () => (await seenLoading()).length).toBeGreaterThan(before);
  await expect(grid).toHaveAttribute('aria-busy', 'false');
  const busyCards = await page.evaluate(
    () => (window as unknown as { busyCards: number[] }).busyCards,
  );
  expect(busyCards.length).toBeGreaterThan(0);
  expect(busyCards.every((count) => count > 0)).toBe(true);
});

test('logging an episode puts its show in the Library as Watching', async ({ page }) => {
  const cards = page.locator('app-media-card');
  await page.goto('/library?search=Paperweight');
  await expect(page.getByText('No library items match these filters.')).toBeVisible();

  await page.goto('/tv/paperweight-and-sons/s/1/e/1');
  await expect(page.getByRole('heading', { name: 'Your viewings' })).toBeVisible();
  // An episode has no status of its own.
  await expect(page.getByRole('combobox', { name: 'Status' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Log viewing' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Viewing saved.' })).toBeVisible();

  await page.goto('/library?search=Paperweight&statuses=in-progress');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('Paperweight & Sons');
  await expect(cards).toContainText(/^.*1 of \d+ episodes logged/s);
});

test('a Library shortcut is active only while the status filter is exactly its status', async ({
  page,
}) => {
  await page.goto('/movies');
  const watchlist = page.getByRole('link', { name: 'Watchlist', exact: true });
  await watchlist.click();
  await expect(page).toHaveURL(/\/library\?statuses=saved$/);
  await expect(watchlist).toHaveAttribute('aria-current', 'page');
  // Filters other than the status don't count.
  await page.getByRole('searchbox', { name: 'Search library' }).fill('the');
  await expect(page).toHaveURL(/statuses=saved&search=the/);
  await expect(watchlist).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Watching', exact: true }).click();
  await expect(page).toHaveURL(/statuses=saved(,|%2C)in-progress/);
  await expect(watchlist).not.toHaveAttribute('aria-current');
});

test('tab titles describe what the URL shows', async ({ page }) => {
  await page.goto('/movies?genres=Drama&page=2');
  await expect(page).toHaveTitle('Movies · Drama · page 2 · TasteTrack');
  // A new search starts from page 1, and the title follows the URL without a new page load.
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('the');
  await expect(page).toHaveTitle('Movies · “the” · Drama · TasteTrack');
  await page.goto('/library?statuses=saved,completed');
  await expect(page).toHaveTitle('Library · Watchlist, Watched · TasteTrack');
  await page.goto(movieUrl);
  await expect(page).toHaveTitle("Quillon's Last Inference · TasteTrack");
});

test('the people search changes the URL only when submitted', async ({ page }) => {
  const urlWrites = await recordUrlWrites(page);
  await page.goto('/people');
  const search = page.getByRole('searchbox', { name: 'Search people' });
  const hint = page.getByText('Press Search to filter the list.');
  const names = page.getByRole('main').getByRole('heading', { level: 2 });
  await expect(names).not.toHaveCount(0);
  const everyone = await names.count();

  await search.pressSequentially('march', { delay: 50 });
  await expect(hint).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(/\/people\?search=march$/);
  await expect(names).toHaveText(['Wendell Marchbank']);
  await expect(hint).toHaveCount(0);
  // Typing wrote nothing. The one search in the URL history is the submitted one.
  expect((await urlWrites()).filter((url) => url.includes('search='))).toEqual([
    '/people?search=march',
  ]);

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(names).toHaveCount(everyone);
  await expect(search).toHaveValue('');
});

test("a person's role chips filter the filmography through the URL", async ({ page }) => {
  await page.goto('/people/wendell');
  const credits = page.locator('.panel p');
  await expect(credits).not.toHaveCount(0);
  const allCredits = await credits.count();

  await page.getByRole('button', { name: 'Writer', exact: true }).click();
  await expect(page).toHaveURL(/\/people\/wendell\?role=Writer$/);
  await expect(credits).not.toHaveCount(allCredits);
  await expect(credits).not.toHaveCount(0);
  for (const credit of await credits.allTextContents()) {
    expect(credit).toContain('Writer');
  }

  await page.goBack();
  await expect(page).toHaveURL(/\/people\/wendell$/);
  await expect(credits).toHaveCount(allCredits);
});

test('a guard declines a Library filter, and the form keeps the choice', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('checkbox', { name: /Decline a Library minimum rating/ }).check();
  // The lab setting lives in memory, so the test stays in the app instead of loading a URL.
  await page.getByRole('link', { name: /Library$/ }).click();
  await expect(page).toHaveURL(/\/library$/);
  const rating = page.getByRole('combobox', { name: 'Minimum rating' });

  await rating.selectOption('9');
  await expect(page.getByRole('alert')).toContainText('A guard declined this filter change');
  await expect(page).toHaveURL(/\/library$/);
  await expect(rating).toHaveValue('9');

  await rating.selectOption('7');
  await expect(page).toHaveURL(/\/library\?minRating=7$/);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test.describe('inspector', () => {
  const inspectorOf = (page: Page) =>
    page.getByRole('complementary', { name: 'ngx-urlik inspector' });
  const paramRow = (page: Page, name: string) =>
    inspectorOf(page)
      .locator('.params div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${name}$`) }) });

  test('decodes the URL into the deepest active route and its params()', async ({ page }) => {
    await page.goto('/tv/brambleworth-manor/s/2/e/1?sort=year:desc');
    const inspector = inspectorOf(page);
    await expect(inspector.locator('.routes')).toHaveText(
      /^BROWSE\s*›\s*SEASON\s*›\s*EPISODE_DETAIL$/,
    );
    await expect(paramRow(page, 'showId')).toContainText("'tv_brambleworth-manor'from the path");
    await expect(paramRow(page, 'sort')).toContainText(
      "{ field: 'year', direction: 'desc' }from ?sort=year:desc",
    );
    await expect(paramRow(page, 'page')).toContainText('1the default, left out of the URL');
  });

  test('marks only the parameters that params() returns new values for', async ({ page }) => {
    await page.goto('/movies?sort=year:desc');
    await expect(page.locator('app-media-card').first()).toBeVisible();
    await page.getByRole('button', { name: 'Drama', exact: true }).click();
    await expect(page).toHaveURL(/genres=Drama/);
    await expect(paramRow(page, 'genres')).toContainText('new value');
    await expect(paramRow(page, 'sort')).not.toContainText('new value');
  });

  test('logs typing as one edit, then one write after the debounce', async ({ page }) => {
    await page.goto('/movies');
    await expect(page.locator('app-media-card').first()).toBeVisible();
    await page
      .getByRole('searchbox', { name: 'Search', exact: true })
      .pressSequentially('the', { delay: 50 });
    await expect(page).toHaveURL(/search=the/);
    const events = inspectorOf(page).getByRole('listitem');
    await expect(events.filter({ hasText: "edits search = 'the'" })).toHaveCount(1);
    await expect(events.filter({ hasText: /edits search = '(t|th)'$/ })).toHaveCount(0);
    const write = events.filter({ hasText: "writes { page: 1, search: 'the' }" });
    await expect(write).toHaveCount(1);
    const wait = Number(/(\d+) ms after the last edit/.exec(await write.innerText())?.[1]);
    // The catalog search waits 300 ms after the last keystroke.
    expect(wait).toBeGreaterThanOrEqual(300);
  });

  test("logs a warning for a value the codec can't read", async ({ page }) => {
    await page.goto('/movies');
    await inspectorOf(page).getByRole('button', { name: 'Open /library?minRating=abc' }).click();
    await expect(page).toHaveURL(/\/library\?minRating=abc$/);
    await expect(paramRow(page, 'minRating')).toContainText('nullfrom ?minRating=abc');
    await expect(
      inspectorOf(page)
        .getByRole('listitem')
        .filter({ hasText: 'PARAM_DESERIALIZE_FAILED for minRating' }),
    ).not.toHaveCount(0);
  });

  test('logs a navigation that a guard declines', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('checkbox', { name: /Decline a Library minimum rating/ }).check();
    await page.getByRole('link', { name: /Library$/ }).click();
    await page.getByRole('combobox', { name: 'Minimum rating' }).selectOption('10');
    await expect(
      inspectorOf(page)
        .getByRole('listitem')
        .filter({ hasText: 'cancelled /library?minRating=10: a guard declined it' }),
    ).toHaveCount(1);
  });

  test('detail panels fit beside the open inspector', async ({ page }) => {
    await page.goto(movieUrl);
    // Columns too wide for the panel overflow past it, so the last control is what to measure.
    const logButton = page.getByRole('button', { name: 'Log viewing' });
    await expect(logButton).toBeVisible();
    const buttonBox = (await logButton.boundingBox())!;
    const inspectorBox = (await inspectorOf(page).boundingBox())!;
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(inspectorBox.x);
  });

  test('shows a first-visit hint until it is dismissed', async ({ page }) => {
    await page.goto('/movies');
    const hint = inspectorOf(page).getByText('Change a filter or open a title');
    await expect(hint).toBeVisible();
    await inspectorOf(page).getByRole('button', { name: 'Got it' }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(
      inspectorOf(page).getByRole('heading', { name: 'ngx-urlik inspector' }),
    ).toBeVisible();
    await expect(hint).toHaveCount(0);
  });

  test('hides, remembers that after a reload, and counts new events', async ({ page }) => {
    await page.goto('/movies');
    await inspectorOf(page).getByRole('button', { name: 'Hide' }).click();
    await page.reload();
    await expect(inspectorOf(page)).toHaveCount(0);
    const opener = page.getByRole('button', { name: /^ngx-urlik inspector/ });
    await page.getByRole('link', { name: /Library$/ }).click();
    await expect(opener).toContainText(/\d+ new events/);
    await opener.click();
    await expect(inspectorOf(page)).toBeVisible();
  });
});
