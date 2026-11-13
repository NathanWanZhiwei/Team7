import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('download JSON and CSV, restore subtasks and tags, and append repeated imports immediately', async ({ page }) => {
  await register(page);
  const tag = await (await page.request.post('/api/tags', {
    data: { name: 'Work', color: '#123456' },
  })).json();
  const todo = await (await page.request.post('/api/todos', { data: {
    title: 'Backup, "quoted" task', priority: 'high', tag_ids: [tag.id],
    due_date: '2035-02-28T09:00:00.000+08:00', is_recurring: true,
    recurrence_pattern: 'monthly', reminder_minutes: 30,
  } })).json();
  const subtask = await (await page.request.post(`/api/todos/${todo.id}/subtasks`, {
    data: { title: 'Restored step' },
  })).json();
  expect((await page.request.put(`/api/subtasks/${subtask.id}`, {
    data: { completed: true },
  })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Export JSON', exact: true })).toBeEnabled();

  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const json = await jsonDownload;
  expect(json.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.json$/);
  const content = await readFile((await json.path())!, 'utf8');
  const payload = JSON.parse(content);
  expect(payload.version).toBe(1);
  expect(payload.todos).toHaveLength(1);
  expect(payload.todos[0].subtasks[0]).toEqual({ title: 'Restored step', completed: true, position: 0 });
  expect(payload.todos[0].tags).toEqual([{ name: 'Work', color: '#123456' }]);
  expect(payload.todos[0].id).toBeUndefined();
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toMatch(/^todos-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(await readFile((await csv.path())!, 'utf8')).toContain('"Backup, ""quoted"" task"');

  expect((await page.request.delete(`/api/todos/${todo.id}`)).status()).toBe(200);
  await page.reload();
  await expect(page.locator('.todo-row')).toHaveCount(0);
  for (let count = 1; count <= 2; count++) {
    await page.getByLabel('Import JSON file').setInputFiles({
      name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(content),
    });
    await expect(page.getByRole('status')).toContainText('Successfully imported 1 todos');
    await expect(page.locator('.todo-row')).toHaveCount(count);
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();
  }
  const restored = await (await page.request.get('/api/todos')).json();
  for (const item of restored) {
    expect(item.id).not.toBe(todo.id);
    expect(item.subtasks[0].id).not.toBe(subtask.id);
    expect(item.subtasks[0].todo_id).toBe(item.id);
    expect(item.subtasks[0].completed).toBe(true);
    expect(item.tags[0].id).toBe(tag.id);
    expect(item.reminder_minutes).toBe(30);
    expect(item.due_date).toBe(todo.due_date);
  }
  expect(await (await page.request.get('/api/tags')).json()).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('import shows syntax and structure errors, resets file input, and accepts empty backups', async ({ page }) => {
  await register(page);
  for (const [content, error] of [
    ['not json', 'Invalid JSON format'],
    ['{"version":1,"exported_at":"2026-01-01"}', 'Failed to import todos. Please check the file format.'],
  ]) {
    await page.getByLabel('Import JSON file').setInputFiles({
      name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(content),
    });
    await expect(page.getByRole('region', { name: 'Export and import todos' }).getByRole('alert')).toHaveText(error);
    await expect(page.getByLabel('Import JSON file')).toHaveValue('');
    await expect(page.locator('.todo-row')).toHaveCount(0);
  }
  await page.getByLabel('Import JSON file').setInputFiles({
    name: 'empty.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, exported_at: '2026-01-01', todos: [] })),
  });
  await expect(page.getByRole('status')).toHaveText('Successfully imported 0 todos');
});

test('transfer APIs authenticate, isolate accounts, validate input and reject cross-origin imports', async ({ page, browser }) => {
  const anonymous = await browser.newContext({ baseURL: 'http://localhost:3217' });
  try {
    expect((await anonymous.request.get('/api/todos/export')).status()).toBe(401);
    expect((await anonymous.request.post('/api/todos/import', { data: {} })).status()).toBe(401);
    await register(page);
    await page.request.post('/api/todos', { data: { title: 'Private todo' } });
    const exported = await page.request.get('/api/todos/export');
    expect(exported.status()).toBe(200);
    expect(exported.headers()['cache-control']).toBe('no-store');
    const payload = await exported.json();
    const stranger = await anonymous.newPage();
    await register(stranger);
    expect((await (await stranger.request.get('/api/todos/export')).json()).todos).toEqual([]);
    expect((await page.request.get('/api/todos/export?format=xml')).status()).toBe(400);
    const malformed = await page.request.post('/api/todos/import', {
      data: Buffer.from('{'), headers: { 'Content-Type': 'application/json' },
    });
    expect(malformed.status()).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'Invalid JSON format' });
    for (const body of [
      { ...payload, version: 2 },
      { ...payload, todos: [{ ...payload.todos[0], priority: 'critical' }] },
    ]) {
      const response = await page.request.post('/api/todos/import', { data: body });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: 'Failed to import todos. Please check the file format.' });
    }
    expect((await page.request.post('/api/todos/import', {
      data: payload, headers: { Origin: 'https://other.example' },
    })).status()).toBe(403);
    const imported = await stranger.request.post('/api/todos/import', { data: payload });
    expect(imported.status()).toBe(200);
    expect(await imported.json()).toEqual({ success: true, imported: 1, tagsCreated: 0, tagsReused: 0 });
    const copies = await (await stranger.request.get('/api/todos')).json();
    expect(copies).toHaveLength(1);
    expect(copies[0].title).toBe('Private todo');
    expect(await (await page.request.get('/api/todos')).json()).toHaveLength(1);
  } finally {
    await anonymous.close();
  }
});
