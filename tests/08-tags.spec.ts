import { expect, test } from '@playwright/test';
import { createTag, createTodo, register } from './helpers';

test('manage tags, multi-select, edit propagation, filtering and cascade deletion', async ({ page }) => {
  await register(page);
  await createTag(page, 'Work', '#FFFF00');
  await createTag(page, 'Urgent', '#EF4444');
  await createTodo(page, 'Tagged task', ['Work', 'Urgent']);
  await createTodo(page, 'Unrelated task');
  const card = page.locator('.todo-row').filter({ hasText: 'Tagged task' });
  await expect(card.getByRole('button', { name: 'Work', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Urgent', exact: true })).toBeVisible();
  const contrast = await card.getByRole('button', { name: 'Work', exact: true }).evaluate((element) => {
    const style = getComputedStyle(element);
    const channels = style.backgroundColor.match(/\d+/g)!.slice(0, 3).map((text) => {
      const channel = Number(text) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return { text: style.color, ratio: 1.05 / (luminance + 0.05) };
  });
  expect(contrast.text).toBe('rgb(255, 255, 255)');
  expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);

  await page.getByRole('button', { name: '+ Manage Tags', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Manage Tags' });
  await modal.getByLabel('Tag name').fill(' Work ');
  await modal.getByRole('button', { name: 'Create Tag', exact: true }).click();
  await expect(modal.getByRole('alert')).toHaveText('A tag with this name already exists');
  await modal.getByRole('button', { name: 'Edit tag Work', exact: true }).click();
  await modal.getByLabel('Tag name').fill('Office');
  await modal.getByLabel('Hex color').fill('#123456');
  await modal.getByRole('button', { name: 'Update Tag', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Office', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Office', exact: true })).toBeVisible();
  await page.reload();
  await expect(card.getByRole('button', { name: 'Office', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Office', exact: true }).click();
  await expect(page.locator('.todo-row')).toHaveCount(1);
  await page.getByLabel('Filter by priority').selectOption('high');
  await expect(page.locator('.todo-row')).toHaveCount(0);
  await page.getByLabel('Filter by priority').selectOption('all');
  await page.getByLabel('Filter by tag').selectOption('');
  await expect(page.locator('.todo-row')).toHaveCount(2);

  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit todo', exact: true });
  await edit.getByRole('button', { name: 'Urgent', exact: true }).click();
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(card.getByRole('button', { name: 'Urgent', exact: true })).toHaveCount(0);
  await createTodo(page, 'Second tagged task', ['Office', 'Urgent']);
  await page.getByLabel('Filter by tag').selectOption({ label: 'Office' });
  await page.getByRole('button', { name: '+ Manage Tags', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await modal.getByRole('button', { name: 'Delete tag Office', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Office', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await modal.getByRole('button', { name: 'Delete tag Office', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Office', exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByLabel('Filter by tag')).toHaveValue('');
  await expect(page.locator('.todo-row')).toHaveCount(3);
  await expect(page.locator('.todo-row').getByRole('button', { name: 'Office', exact: true })).toHaveCount(0);
  await expect(page.locator('.todo-row').filter({ hasText: 'Second tagged task' })
    .getByRole('button', { name: 'Urgent', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('tag APIs reject unauthenticated and cross-user requests and validate input', async ({ page, browser }) => {
  await register(page);
  const request = page.request;
  const created = await request.post('/api/tags', { data: { name: 'Work' } });
  expect(created.status()).toBe(201);
  const tag = await created.json();
  expect(tag.color).toBe('#3B82F6');
  const todo = await (await request.post('/api/todos', { data: { title: 'Private' } })).json();
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const stranger = await context.newPage();
  try {
    const tagPath = `/api/tags/${tag.id}`;
    const attachment = `/api/todos/${todo.id}/tags`;
    for (const [method, url, data] of [
      ['GET', '/api/tags', undefined], ['POST', '/api/tags', { name: 'X' }],
      ['PUT', tagPath, { name: 'X' }], ['DELETE', tagPath, undefined],
      ['POST', attachment, { tag_id: tag.id }], ['DELETE', attachment, { tag_id: tag.id }],
    ] as const) {
      expect((await context.request.fetch(url, { method, data })).status()).toBe(401);
    }
    await register(stranger);
    expect((await stranger.request.put(tagPath, { data: { name: 'Stolen' } })).status()).toBe(404);
    expect((await stranger.request.delete(tagPath)).status()).toBe(404);
    expect((await stranger.request.post(attachment, { data: { tag_id: tag.id } })).status()).toBe(404);
    expect((await stranger.request.delete(attachment, { data: { tag_id: tag.id } })).status()).toBe(404);
    expect(await (await stranger.request.get('/api/tags')).json()).toEqual([]);
    const foreign = await stranger.request.post('/api/tags', { data: { name: 'Work' } });
    expect(foreign.status()).toBe(201);
    const foreignTag = await foreign.json();
    expect((await request.post(attachment, { data: { tag_id: foreignTag.id } })).status()).toBe(404);
    expect((await request.delete(attachment, { data: { tag_id: foreignTag.id } })).status()).toBe(404);
    for (const data of [{ name: ' ' }, { name: 7 }, { name: 'Bad', color: 'red' },
      { name: 'Bad', color: '' }, { name: 'Bad', color: null }]) {
      expect((await request.post('/api/tags', { data })).status()).toBe(400);
    }
    expect((await request.post('/api/tags', { data: { name: 'Work' } })).status()).toBe(409);
    expect((await request.put(tagPath, { data: {} })).status()).toBe(400);
    expect((await request.post('/api/tags', {
      data: '{', headers: { 'Content-Type': 'application/json' },
    })).status()).toBe(400);
    expect((await request.post(attachment, { data: { tag_id: '1' } })).status()).toBe(400);
    expect((await request.post('/api/tags', {
      headers: { Origin: 'https://other.example' }, data: { name: 'Blocked' },
    })).status()).toBe(403);
    expect((await request.post('/api/todos', {
      data: { title: 'Invalid attachment', tag_ids: [99999999] },
    })).status()).toBe(404);
    for (const method of ['POST', 'POST', 'DELETE', 'DELETE']) {
      expect((await request.fetch(attachment, { method, data: { tag_id: tag.id } })).status()).toBe(200);
    }
    expect((await (await request.get(`/api/todos/${todo.id}`)).json()).tags).toEqual([]);
    const start = performance.now();
    for (let index = 0; index < 5; index++) {
      const result = await request.post('/api/tags', { data: { name: `Timing-${index}` } });
      expect(result.status()).toBe(201);
      const timed = await result.json();
      expect((await request.put(`/api/tags/${timed.id}`, { data: { color: '#123456' } })).status()).toBe(200);
      expect((await request.get('/api/tags')).status()).toBe(200);
      expect((await request.delete(`/api/tags/${timed.id}`)).status()).toBe(200);
    }
    expect((performance.now() - start) / 20).toBeLessThan(300);
  } finally {
    await context.close();
  }
});
