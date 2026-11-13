import { expect, test } from '@playwright/test';
import { register } from './helpers';
import { formatMonth, parseMonthParam, shiftMonth } from '../lib/calendar';
import { formatSingaporeDate, getSingaporeNow } from '../lib/timezone';

function todo(title: string, due_date: string | null, priority = 'medium', completed = false) {
  return {
    title, due_date, priority, completed, is_recurring: false, recurrence_pattern: null,
    reminder_minutes: null, created_at: '2026-01-01 00:00:00', subtasks: [], tags: [],
  };
}

test('calendar navigation, month bookmarks, today, fallback and fixed grid dimensions', async ({ page }) => {
  await register(page);
  const current = parseMonthParam(null);
  const currentKey = formatMonth(current);
  const previous = formatMonth(shiftMonth(current, -1));
  const today = formatSingaporeDate(getSingaporeNow());
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  const table = page.locator('.calendar-grid');
  await expect(table.locator('tbody tr')).toHaveCount(6);
  await expect(table.locator('tbody button')).toHaveCount(42);
  await expect(table.getByRole('columnheader')).toHaveText(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  await expect(table.locator('[aria-current="date"]')).toHaveAttribute('data-date', today);
  await expect(table.locator('.calendar-cell--weekend')).toHaveCount(12);
  const height = await table.evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`month=${previous}$`));
  await page.reload();
  await expect(table).toBeVisible();
  expect(await table.evaluate((element) => element.getBoundingClientRect().height)).toBe(height);
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`month=${currentKey}$`));
  await page.goto('/calendar?month=2026-02');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`month=${currentKey}$`));
  await page.goto('/calendar?month=2026-13');
  await expect(table.locator('[aria-current="date"]')).toHaveAttribute('data-date', today);
  await expect(table.locator('tbody button')).toHaveCount(42);
  await page.getByRole('link', { name: 'List', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My todos' })).toBeVisible();
});

test('due dates, holidays, priority pills, overflow, completion and accessible day details', async ({ page }) => {
  await register(page);
  const response = await page.request.post('/api/todos/import', { data: {
    version: 1, exported_at: '2026-01-01', todos: [
      todo('Urgent midnight', '2025-12-31T16:30:00Z', 'high'),
      todo('Medium task', '2026-01-01T10:00:00+08:00'),
      todo('Completed low task', '2026-01-01T11:00:00+08:00', 'low', true),
      todo('Another urgent task', '2026-01-01T12:00:00+08:00', 'high'),
      todo('March midnight', '2026-03-01T00:30'),
      todo('Undated hidden task', null),
    ],
  } });
  expect(response.status()).toBe(200);
  await page.goto('/calendar?month=2026-01');
  const cell = page.locator('[data-date="2026-01-01"]');
  await expect(cell.getByText("New Year's Day", { exact: true })).toBeVisible();
  await expect(cell.locator('.calendar-todo')).toHaveCount(3);
  await expect(cell.getByText('+1 more', { exact: true })).toBeVisible();
  await expect(cell.getByText('Urgent midnight', { exact: true })).toBeVisible();
  await expect(page.getByText('Undated hidden task', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-date="2025-12-31"]').getByText('Urgent midnight', { exact: true })).toHaveCount(0);
  await cell.focus();
  await page.keyboard.press('Enter');
  const modal = page.getByRole('dialog', { name: 'Todos for 2026-01-01', exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('listitem')).toHaveCount(4);
  await expect(modal.getByText("New Year's Day", { exact: true })).toBeVisible();
  await expect(modal.getByRole('checkbox', { name: 'Completed: Completed low task' })).toBeChecked();
  await expect(modal.getByRole('checkbox', { name: 'Completed: Completed low task' })).toBeDisabled();
  const colors = await modal.locator('.priority-badge').evaluateAll((elements) =>
    [...new Set(elements.map((element) => getComputedStyle(element).backgroundColor))],
  );
  expect(colors).toHaveLength(3);
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(cell).toBeFocused();
  await page.goto('/calendar?month=2026-03');
  await expect(page.locator('[data-date="2026-03-01"]').getByText('March midnight', { exact: true })).toBeVisible();
  await page.locator('[data-date="2026-03-02"]').click();
  const empty = page.getByRole('dialog', { name: 'Todos for 2026-03-02', exact: true });
  await expect(empty.getByText('No todos due on this day.', { exact: true })).toBeVisible();
  await empty.getByRole('button', { name: 'Close', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('calendar and holidays require authentication and keep other users todos private', async ({ page, browser }) => {
  const context = await browser.newContext({ baseURL: 'http://localhost:3217' });
  try {
    const stranger = await context.newPage();
    await stranger.goto('/calendar');
    await expect(stranger).toHaveURL(/\/login$/);
    expect((await context.request.get('/api/holidays')).status()).toBe(401);
    await register(page);
    await page.request.post('/api/todos/import', { data: {
      version: 1, exported_at: '2026-01-01', todos: [todo('Private calendar event', '2026-01-01T10:00')],
    } });
    const holidays = await page.request.get('/api/holidays?year=2026&month=12');
    expect(holidays.status()).toBe(200);
    const payload = await holidays.json();
    expect(payload.holidays.some((holiday: { date: string }) => holiday.date === '2027-01-01')).toBe(true);
    for (let index = 0; index < 3; index++) {
      const started = performance.now();
      expect((await page.request.get('/api/holidays?year=2026&month=12')).status()).toBe(200);
      expect(performance.now() - started).toBeLessThan(100);
    }
    expect((await (await page.request.get('/api/holidays')).json()).holidays.length).toBeGreaterThan(30);
    for (const query of ['year=2026', 'month=1', 'year=bad&month=1', 'year=2026&month=13', 'year=2026&month=0']) {
      expect((await page.request.get(`/api/holidays?${query}`)).status()).toBe(400);
    }
    await register(stranger);
    await stranger.goto('/calendar?month=2026-01');
    await expect(stranger.locator('[data-date="2026-01-01"] .calendar-holiday')).toBeVisible();
    await expect(stranger.getByText('Private calendar event', { exact: true })).toHaveCount(0);
    expect(await (await stranger.request.get('/api/todos')).json()).toEqual([]);
  } finally {
    await context.close();
  }
});

test('month navigation with 490 todos renders within 200ms', async ({ page }) => {
  await register(page);
  expect((await page.request.post('/api/todos/import', { data: {
    version: 1, exported_at: '2026-01-01',
    todos: Array.from({ length: 490 }, (_, index) => todo(`Performance task ${index}`, '2026-01-01T10:00')),
  } })).status()).toBe(200);
  await page.goto('/calendar?month=2026-01');
  await expect(page.locator('[data-date="2026-01-01"] .calendar-overflow')).toHaveText('+487 more');
  const durations: number[] = [];
  for (let index = 0; index < 4; index++) {
    durations.push(await page.evaluate(() => {
      const heading = document.querySelector('#calendar-month-heading')!;
      const previous = heading.textContent;
      const started = performance.now();
      return new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Navigation timed out')); }, 5000);
        const observer = new MutationObserver(() => {
          if (heading.textContent !== previous) {
            clearTimeout(timer);
            observer.disconnect();
            requestAnimationFrame(() => resolve(performance.now() - started));
          }
        });
        observer.observe(heading, { childList: true, subtree: true, characterData: true });
        (document.querySelector('[aria-label="Next month"]') as HTMLButtonElement).click();
      });
    }));
  }
  for (const duration of durations) expect(duration).toBeLessThan(200);
});

test('holiday request failures remain visible instead of appearing as an empty successful load', async ({ page }) => {
  await register(page);
  await page.route('**/api/holidays?*', (route) => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Holiday service unavailable' }),
  }));
  await page.goto('/calendar?month=2026-01');
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load holidays' }))
    .toContainText('Holiday service unavailable');
  await expect(page.locator('.calendar-grid tbody tr')).toHaveCount(6);
});
