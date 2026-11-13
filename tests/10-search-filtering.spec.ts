import { expect, test } from '@playwright/test';
import { addSubtask, createTag, createTodo, register } from './helpers';

test('search, advanced filters, saved presets, clear, and empty states', async ({ page }) => {
  await register(page);
  await createTag(page, 'Work');

  const tomorrow = await page.evaluate(() => {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  });

  await page.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('high');
  await page.getByRole('textbox', { name: 'Due date and time (Singapore)' }).fill(`${tomorrow}T09:00`);
  await createTodo(page, 'Planning session', ['Work']);
  await createTodo(page, 'Unrelated inbox task');
  await addSubtask(page, 'Planning session', 'Prepare meeting agenda');
  const target = page.locator('.todo-row').filter({ hasText: 'Planning session' });
  const unrelated = page.locator('.todo-row').filter({ hasText: 'Unrelated inbox task' });

  const search = page.getByRole('searchbox', { name: 'Search todos and subtasks' });
  const searchStartedAt = Date.now();
  await search.fill('MEETING');
  await expect(target).toBeVisible();
  await expect(unrelated).toHaveCount(0);
  expect(Date.now() - searchStartedAt).toBeGreaterThanOrEqual(250);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.todo-row')).toHaveCount(2);

  await target.getByRole('checkbox').first().check();
  await page.getByLabel('Filter by priority').selectOption('high');
  await page.getByLabel('Filter by tag').selectOption({ label: 'Work' });
  await page.getByRole('button', { name: '▶ Advanced' }).click();
  await page.getByLabel('Filter by completion status').selectOption('completed');
  await page.getByLabel('Due Date From').fill(tomorrow);
  await page.getByLabel('Due Date To').fill(tomorrow);
  await search.fill('agenda');
  await expect(target).toBeVisible();
  await expect(page.locator('.todo-row')).toHaveCount(1);

  await page.getByRole('button', { name: '💾 Save Filter' }).click();
  const saveDialog = page.getByRole('dialog', { name: 'Save filter' });
  await expect(saveDialog.getByText(/Search: "agenda".*Priority: High.*Tag: Work/)).toBeVisible();
  await saveDialog.getByLabel('Filter name').fill('Weekly review');
  await saveDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(saveDialog).not.toBeVisible();

  await page.getByRole('button', { name: 'Clear All' }).click();
  await expect(page.locator('.todo-row')).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: '▶ Advanced' }).click();
  await page.getByRole('button', { name: 'Weekly review', exact: true }).click();
  await expect(page.locator('.todo-row')).toHaveCount(1);
  await expect(search).toHaveValue('agenda');
  await expect(page.getByLabel('Filter by priority')).toHaveValue('high');
  await expect(page.getByLabel('Filter by tag')).toHaveValue(/^\d+$/);
  await expect(page.getByLabel('Filter by completion status')).toHaveValue('completed');
  await expect(page.getByLabel('Due Date From')).toHaveValue(tomorrow);
  await expect(page.getByLabel('Due Date To')).toHaveValue(tomorrow);
  await page.getByRole('button', { name: 'Clear All' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByLabel('Filter by priority')).toHaveValue('all');
  await expect(page.getByLabel('Filter by tag')).toHaveValue('');
  await expect(page.getByLabel('Filter by completion status')).toHaveValue('all');
  await expect(page.getByLabel('Due Date From')).toHaveValue('');
  await expect(page.getByLabel('Due Date To')).toHaveValue('');

  await page.getByRole('button', { name: '+ Manage Tags', exact: true }).click();
  const tagDialog = page.getByRole('dialog', { name: 'Manage Tags' });
  page.once('dialog', (dialog) => dialog.accept());
  await tagDialog.getByRole('button', { name: 'Delete tag Work' }).click();
  await expect(tagDialog.getByRole('button', { name: 'Work', exact: true })).toHaveCount(0);
  await tagDialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.reload();
  await page.getByRole('button', { name: '▶ Advanced' }).click();
  await page.getByRole('button', { name: 'Weekly review', exact: true }).click();
  await expect(page.locator('.todo-row')).toHaveCount(1);
  await expect(target).toBeVisible();
  await expect(page.getByLabel('Filter by priority')).toHaveValue('high');

  await search.fill('no matching todo');
  await expect(page.getByRole('status')).toHaveText('No todos match your filters.');
  await page.getByRole('button', { name: 'Clear All' }).click();
  await expect(page.locator('.todo-row')).toHaveCount(2);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete preset Weekly review' }).click();
  await expect(page.getByRole('button', { name: 'Weekly review', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '▶ Advanced' }).click();
  await expect(page.getByRole('button', { name: 'Weekly review', exact: true })).toHaveCount(0);
});

test('search waits 300ms after the final input, clears immediately, and stays local', async ({ page }) => {
  await register(page);
  await createTodo(page, 'Alpha task');
  await createTodo(page, 'Beta task');
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const search = page.getByRole('searchbox', { name: 'Search todos and subtasks' });
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await search.fill('Alpha');
  await page.clock.runFor(200);
  expect(await page.locator('.todo-row').count()).toBe(2);
  await search.fill('Beta');
  await page.clock.runFor(299);
  expect(await page.locator('.todo-row').count()).toBe(2);
  await page.clock.runFor(1);
  await expect(page.locator('.todo-row')).toHaveCount(1);
  await expect(page.locator('.todo-title')).toHaveText('Beta task');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.todo-row')).toHaveCount(2);
  await page.clock.runFor(300);
  await expect(page.locator('.todo-row')).toHaveCount(2);
  expect(requests).toEqual([]);
});

test('presets handle corrupt data, isolate accounts, and report storage write failures', async ({ page }) => {
  await register(page);
  const { user } = await (await page.request.get('/api/auth/me')).json();
  const key = `todo-app:filter-presets:${user.userId}`;
  await page.evaluate(({ key, userId }) => {
    localStorage.setItem(key, '{broken JSON');
    const preset = {
      id: 'foreign-preset', name: 'Other account private query',
      filters: { search: 'private', priority: 'all', tagId: 'all', completion: 'all',
        dueDateFrom: null, dueDateTo: null },
      createdAt: '2026-01-01T00:00:00.000+08:00',
    };
    localStorage.setItem(`todo-app:filter-presets:${userId + 100000}`, JSON.stringify([preset]));
    localStorage.setItem('todo-app:filter-presets', JSON.stringify([preset]));
  }, { key, userId: user.userId });
  await page.reload();
  await page.getByRole('button', { name: '▶ Advanced' }).click();
  await expect(page.getByText('No saved filters.', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('You have no todos yet.');
  await page.getByRole('searchbox').fill('planning');
  await page.getByRole('button', { name: '💾 Save Filter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save filter' });
  await dialog.getByLabel('Filter name').fill('My private query');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
  });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Storage full');
  await expect(dialog).toBeVisible();
  await page.reload();
  await page.getByRole('searchbox').fill('planning');
  await page.getByRole('button', { name: '💾 Save Filter' }).click();
  await dialog.getByLabel('Filter name').fill('My private query');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(saved).toHaveLength(1);
  expect(saved[0].createdAt).toMatch(/\+08:00$/);
  await page.request.post('/api/auth/logout');
  await page.goto('/login');
  await page.getByLabel('Username').fill(`switch-${crypto.randomUUID().slice(0, 12)}`);
  await page.getByRole('button', { name: 'Register passkey', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My todos' })).toBeVisible();
  await page.getByRole('button', { name: '▶ Advanced' }).click();
  await expect(page.getByRole('button', { name: 'My private query', exact: true })).toHaveCount(0);
});
