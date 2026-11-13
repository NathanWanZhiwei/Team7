import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const port = 3217;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  workers: 1,
  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' } },
  ],
  use: {
    baseURL,
    browserName: 'chromium',
    timezoneId: 'Asia/Singapore',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    env: {
      SESSION_SECRET: randomBytes(32).toString('hex'),
      RP_ID: 'localhost',
      RP_ORIGIN: baseURL,
      TODO_DATABASE_PATH: join(__dirname, 'tag-e2e.db'),
    },
  },
});
