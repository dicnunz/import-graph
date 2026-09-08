import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT ?? 4177);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`
  },
  webServer: {
    command: `npm run build -w @boundary-atlas/web && npm run preview -w @boundary-atlas/web -- --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: false
  }
});
