import { expect, type Page } from '@playwright/test';

export async function register(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send('WebAuthn.enable');
  await session.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto('/login');
  await page.getByLabel('Username').fill(`tags-${crypto.randomUUID().slice(0, 12)}`);
  await page.getByRole('button', { name: 'Register passkey', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My todos' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Manage Tags', exact: true })).toBeEnabled();
}

export async function createTag(page: Page, name: string, color = '#3B82F6') {
  await page.getByRole('button', { name: '+ Manage Tags', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Manage Tags' });
  await modal.getByLabel('Tag name').fill(name);
  await modal.getByLabel('Hex color').fill(color);
  await modal.getByRole('button', { name: 'Create Tag', exact: true }).click();
  await expect(modal.getByRole('button', { name, exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
}

export async function createTodo(page: Page, title: string, tags: string[] = []) {
  const form = page.getByRole('region', { name: 'Add a todo' });
  await form.getByLabel('Title', { exact: true }).fill(title);
  for (const tag of tags) await form.getByRole('button', { name: tag, exact: true }).click();
  const response = page.waitForResponse((response) =>
    response.url().endsWith('/api/todos') && response.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Add todo', exact: true }).click();
  expect((await response).status()).toBe(201);
  await expect(page.locator('.todo-row').filter({ hasText: title })).toBeVisible();
}
