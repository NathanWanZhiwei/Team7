import { expect, test } from '@playwright/test';
import { createTag, register } from './helpers';

test('save, quick-use, manage, and delete a template without copying tags', async ({ page }) => {
  await register(page);
  await createTag(page, 'Work');
  const form = page.getByRole('region', { name: 'Add a todo' });
  const dueValue = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(Date.now() + 2 * 60 * 60_000));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  });
  await form.getByLabel('Title', { exact: true }).fill('Client kickoff');
  await form.getByRole('combobox').nth(0).selectOption('high');
  await form.locator('input[type="datetime-local"]').fill(dueValue);
  await form.getByLabel('Repeat').check();
  await form.getByLabel('Recurrence pattern').selectOption('weekly');
  await form.getByLabel('Reminder').selectOption('30');
  await form.getByRole('button', { name: 'Work', exact: true }).click();
  await form.getByRole('button', { name: '💾 Save as Template' }).click();

  const saveDialog = page.getByRole('dialog', { name: 'Save as Template' });
  await saveDialog.getByLabel('Name').fill('Kickoff');
  await saveDialog.getByLabel('Description (optional)').fill('Client onboarding meeting');
  await saveDialog.getByLabel('Category (optional)').fill('Work');
  await saveDialog.getByRole('textbox', { name: 'Checklist item' }).fill('Prepare agenda');
  await saveDialog.getByRole('button', { name: 'Add item' }).click();
  await saveDialog.getByRole('textbox', { name: 'Checklist item' }).fill('Invite stakeholders');
  await saveDialog.getByRole('button', { name: 'Add item' }).click();
  const saveResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/templates') && response.request().method() === 'POST',
  );
  await saveDialog.getByRole('button', { name: 'Save Template' }).click();
  expect((await saveResponse).status()).toBe(201);
  const template = await (await saveResponse).json();
  expect(template.due_date_offset_minutes).toBeGreaterThan(0);

  const quickUse = page.getByLabel('Use Template');
  await expect(quickUse.locator('option', { hasText: 'Kickoff (Work)' })).toHaveCount(1);
  const useStart = Date.now();
  const useResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/templates/${template.id}/use`),
  );
  await quickUse.selectOption({ label: 'Kickoff (Work)' });
  expect((await useResponse).status()).toBe(201);
  const created = await (await useResponse).json();
  expect(Math.abs(
    Date.parse(created.due_date) - (useStart + template.due_date_offset_minutes * 60_000),
  )).toBeLessThan(120_000);
  expect(created.tags).toEqual([]);
  expect(created.subtasks.map((item: { title: string; position: number; completed: boolean }) => ({
    title: item.title,
    position: item.position,
    completed: item.completed,
  }))).toEqual([
    { title: 'Prepare agenda', position: 0, completed: false },
    { title: 'Invite stakeholders', position: 1, completed: false },
  ]);
  const firstRow = page.locator('.todo-row').filter({ hasText: 'Client kickoff' }).first();
  await expect(firstRow.getByText('High', { exact: true })).toBeVisible();
  await expect(firstRow.getByText('weekly', { exact: false })).toBeVisible();
  await expect(firstRow.getByText('🔔 30m', { exact: true })).toBeVisible();
  await expect(firstRow.getByRole('button', { name: 'Work', exact: true })).toHaveCount(0);
  await firstRow.getByRole('button', { name: /Subtasks/ }).click();
  await expect(firstRow.getByText('0/2 subtasks')).toBeVisible();
  await expect(firstRow.getByLabel('Mark "Prepare agenda" as complete')).not.toBeChecked();
  await expect(firstRow.getByLabel('Mark "Invite stakeholders" as complete')).not.toBeChecked();

  await page.getByRole('button', { name: '📋 Templates' }).click();
  const manager = page.getByRole('dialog', { name: 'Templates' });
  await expect(manager.getByText('Kickoff', { exact: true })).toBeVisible();
  const managerUseResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/templates/${template.id}/use`),
  );
  await manager.getByRole('button', { name: 'Use', exact: true }).click();
  expect((await managerUseResponse).status()).toBe(201);
  await expect(manager).not.toBeVisible();
  await expect(page.locator('.todo-row').filter({ hasText: 'Client kickoff' })).toHaveCount(2);

  await page.getByRole('button', { name: '📋 Templates' }).click();
  const reopenedManager = page.getByRole('dialog', { name: 'Templates' });
  page.once('dialog', (dialog) => dialog.accept());
  await reopenedManager.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(reopenedManager.getByText('Kickoff', { exact: true })).toHaveCount(0);
  await expect(quickUse.locator('option', { hasText: 'Kickoff (Work)' })).toHaveCount(0);
  await expect(page.locator('.todo-row').filter({ hasText: 'Client kickoff' })).toHaveCount(2);
  await reopenedManager.getByRole('button', { name: 'Close', exact: true }).click();
});

test('template APIs validate input and keep templates private to their owner', async ({ page, browser }) => {
  await register(page);
  const anonymousContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    expect((await anonymousContext.request.get('/api/templates')).status()).toBe(401);
    expect((await anonymousContext.request.post('/api/templates', {
      data: { name: 'Private', title_template: 'Secret' },
    })).status()).toBe(401);
  } finally {
    await anonymousContext.close();
  }

  const request = page.request;
  for (const data of [
    { name: 'Missing offset', title_template: 'Review', is_recurring: true, recurrence_pattern: 'weekly' },
    { name: 'Missing reminder date', title_template: 'Review', reminder_minutes: 30 },
    { name: 'Bad offset', title_template: 'Review', due_date_offset_minutes: 0 },
    { name: 'Bad priority', title_template: 'Review', priority: 'urgent' },
  ]) {
    expect((await request.post('/api/templates', { data })).status()).toBe(400);
  }
  expect((await request.post('/api/templates', {
    data: '{',
    headers: { 'Content-Type': 'application/json' },
  })).status()).toBe(400);
  expect((await request.post('/api/templates', {
    headers: { Origin: 'https://other.example' },
    data: { name: 'Blocked', title_template: 'Review' },
  })).status()).toBe(403);

  const response = await request.post('/api/templates', {
    data: {
      name: 'Monthly report',
      title_template: 'Prepare report',
      priority: 'medium',
      due_date_offset_minutes: 120,
      subtasks: [{ title: 'Collect data', position: 0 }],
    },
  });
  expect(response.status()).toBe(201);
  const template = await response.json();
  expect((await request.put(`/api/templates/${template.id}`, {
    data: { name: 'Updated report', category: 'Work' },
  })).status()).toBe(200);
  const todoResponse = await request.post(`/api/templates/${template.id}/use`);
  expect(todoResponse.status()).toBe(201);
  const todo = await todoResponse.json();
  expect(todo.tags).toEqual([]);
  expect(todo.subtasks.map((item: { title: string; completed: boolean }) => ({
    title: item.title,
    completed: item.completed,
  }))).toEqual([{ title: 'Collect data', completed: false }]);

  const strangerContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const stranger = await strangerContext.newPage();
  try {
    await register(stranger);
    expect(await (await stranger.request.get('/api/templates')).json()).toEqual([]);
    expect((await stranger.request.put(`/api/templates/${template.id}`, {
      data: { name: 'Stolen' },
    })).status()).toBe(404);
    expect((await stranger.request.delete(`/api/templates/${template.id}`)).status()).toBe(404);
    expect((await stranger.request.post(`/api/templates/${template.id}/use`)).status()).toBe(404);
  } finally {
    await strangerContext.close();
  }

  expect((await request.delete(`/api/templates/${template.id}`)).status()).toBe(200);
  expect((await request.get(`/api/todos/${todo.id}`)).status()).toBe(200);
  expect(await (await request.get('/api/templates')).json()).toEqual([]);
});
