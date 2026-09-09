import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const demo = JSON.parse(readFileSync('apps/web/public/demo-report.json', 'utf8'));
const cycleFixture = 'docs/samples/fixtures/ts-cycle-dashboard/report.json';

test.describe('Boundary Atlas report viewer', () => {
  test('loads the local example and exposes the graph and evidence without runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page).toHaveTitle(/Import Graph/i);
    await expect(page.getByRole('heading', { name: 'ts-cross-feature-portal', exact: true })).toBeVisible();
    await expect(page.getByText('9 of 9 nodes · 10 edges', { exact: true })).toBeVisible();
    await expect(page.locator('.finding-card h3')).toContainText('Cross-feature fan-out from src/features/checkout');
    await expect(page.getByRole('button', { name: 'Open report JSON', exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('searches paths and specifiers without dangling links, then recovers from an empty search', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    const search = page.getByRole('searchbox', { name: 'Search modules or import specifiers' });
    await search.fill('build-daily-brief.ts');
    await expect(page.getByText('1 of 9 nodes · 0 edges', { exact: true })).toBeVisible();
    await search.fill('../finance/index.js');
    await expect(page.getByText('2 of 9 nodes · 1 edge', { exact: true })).toBeVisible();
    await search.fill('no-such-path');
    await expect(page.getByText('No modules in this view', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reset graph filters' }).click();
    await expect(page.getByText('9 of 9 nodes · 10 edges', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('filters findings independently and isolates their graph evidence', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Filter severity').selectOption('warn');
    await page.getByLabel('Filter finding type').selectOption('cross-feature');
    await expect(page.getByText('1 of 5 findings', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Cross-feature fan-out from src\/features\/reporting/ }).click();
    await expect(page.locator('.finding-card h3')).toContainText('src/features/reporting');
    await page.getByRole('button', { name: 'Isolate finding in graph' }).click();
    await expect(page.getByText('Showing selected finding', { exact: true })).toBeVisible();
    await expect(page.getByText('3 of 9 nodes · 2 edges', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show full graph', exact: true }).click();
    await expect(page.getByText('9 of 9 nodes · 10 edges', { exact: true })).toBeVisible();
    await page.getByLabel('Filter severity').selectOption('info');
    await expect(page.getByText('No findings match these filters', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear finding filters' }).click();
    await expect(page.getByText('5 of 5 findings', { exact: true })).toBeVisible();
  });

  test('keeps all four checkout dependencies when isolating after clearing a path search', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('searchbox', { name: 'Search modules or import specifiers' });
    await expect(page.locator('.finding-card h3')).toHaveText('Cross-feature fan-out from src/features/checkout');
    await search.fill('checkout');
    await expect(page.getByText('4 of 9 nodes · 3 edges', { exact: true })).toBeVisible();
    await search.fill('');
    await page.getByRole('button', { name: 'Isolate finding in graph', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByText('5 of 9 nodes · 4 edges', { exact: true })).toBeVisible();
    await expect(page.locator('.finding-card h3')).toHaveText('Cross-feature fan-out from src/features/checkout');
    for (const feature of ['auth', 'finance', 'marketing', 'support']) {
      await expect(page.locator('.module-table').getByRole('button', { name: `src/features/${feature}/index.ts public`, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Show full graph', exact: true }).click();
    await expect(page.getByText('9 of 9 nodes · 10 edges', { exact: true })).toBeVisible();
  });

  test('navigates dependencies with keyboard controls and resets focus when switching scope', async ({ page }) => {
    await page.goto('/');
    const module = page.locator('.module-table').getByRole('button', { name: /src\/features\/checkout\/submit-order.ts/ });
    await module.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Node detail', exact: true })).toBeVisible();
    await expect(page.locator('.node-card h3')).toHaveText('src/features/checkout/submit-order.ts');
    await page.getByRole('button', { name: 'Focus direct dependencies' }).click();
    await expect(page.getByText('6 of 9 nodes · 5 edges', { exact: true })).toBeVisible();
    await page.locator('.connections').getByRole('button', { name: /src\/features\/finance\/index.ts/ }).click();
    await expect(page.locator('.node-card h3')).toHaveText('src/features/finance/index.ts');
    await expect(page.getByText('2 of 9 nodes · 1 edge', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Folder', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Folder view', exact: true })).toBeVisible();
    await expect(page.locator('.focus-banner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Folder', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('preserves the open report after malformed and broken uploads, allows retry, and imports a valid fixture', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ts-cross-feature-portal', exact: true })).toBeVisible();
    const input = page.getByLabel('Open report JSON', { exact: true });
    const invalidFile = { name: 'report.json', mimeType: 'application/json', buffer: Buffer.from('{broken') };
    await input.setInputFiles(invalidFile);
    await expect(page.getByRole('alert')).toContainText('This file is not valid JSON.');
    await expect(page.getByRole('heading', { name: 'ts-cross-feature-portal', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await input.setInputFiles(invalidFile);
    await expect(page.getByRole('alert')).toContainText('This file is not valid JSON.');
    const broken = structuredClone(demo);
    broken.graphs.file.edges[0].target = 'file:missing.ts';
    await input.setInputFiles({ name: 'report.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(broken)) });
    await expect(page.getByRole('alert')).toContainText('report.graphs.file.edges[0].target');
    await input.setInputFiles(cycleFixture);
    await expect(page.getByRole('heading', { name: 'ts-cycle-dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.finding-card h3')).toContainText('cycle');
    expect(errors).toEqual([]);
  });

  test('rejects oversized files before reading and leaves graph controls available', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ts-cross-feature-portal', exact: true })).toBeVisible();
    await page.getByLabel('Open report JSON', { exact: true }).setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
    await expect(page.getByRole('alert')).toContainText('larger than 20 MiB');
    await expect(page.getByText('9 of 9 nodes · 10 edges', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open report JSON', exact: true })).toBeEnabled();
  });

  test('uses an embedded report without requesting the example', async ({ page }) => {
    const fixture = JSON.parse(readFileSync(cycleFixture, 'utf8'));
    await page.addInitScript((report) => { window.__BOUNDARY_ATLAS_EMBEDDED_REPORT__ = report; }, fixture);
    await page.route('**/demo-report.json', (route) => route.abort());
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ts-cycle-dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Embedded report');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('recovers from a failed initial load by opening a local report', async ({ page }) => {
    await page.route('**/demo-report.json', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('Example report could not be loaded');
    await page.getByLabel('Open report JSON', { exact: true }).setInputFiles(cycleFixture);
    await expect(page.getByRole('heading', { name: 'ts-cycle-dashboard', exact: true })).toBeVisible();
  });

  test('fits the graph and report controls into a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth, canvas: document.querySelector('canvas')!.getBoundingClientRect().width, panel: document.querySelector('.graph-frame')!.getBoundingClientRect().width }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
    expect(Math.abs(dimensions.canvas - dimensions.panel)).toBeLessThan(2);
    await page.getByRole('button', { name: 'Package', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Package view', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open report JSON', exact: true })).toBeVisible();
  });
});

test('keeps a module search in place while inspecting a keyboard selection', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search modules or import specifiers' });
  await search.fill('build-daily-brief.ts');
  const module = page.locator('.module-table button').first();
  await module.focus();
  await page.keyboard.press('Enter');
  await expect(search).toHaveValue('build-daily-brief.ts');
  await expect(module).toHaveAttribute('aria-pressed', 'true');
  await expect(module).toBeFocused();
});
