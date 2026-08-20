import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const targets = [
  { app: 'customer', url: process.env.SMOKE_CUSTOMER_URL ?? 'http://127.0.0.1:4173/help', heading: 'Centro de ayuda', path: '/help' },
  { app: 'rider', url: process.env.SMOKE_RIDER_URL ?? 'http://127.0.0.1:4174/rider/current', heading: 'Acceso de repartidor', path: '/login' },
  { app: 'backoffice', url: process.env.SMOKE_BACKOFFICE_URL ?? 'http://127.0.0.1:4175/orders', heading: 'Acceso de operaciones', path: '/login' },
];
const viewports = [
  { width: 390, height: 844, name: 'mobile' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 1440, height: 900, name: 'desktop' },
];

const localChrome = process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : undefined;
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
  (localChrome && existsSync(localChrome) ? localChrome : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
const failures = [];

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  for (const target of targets) {
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    let response;
    try {
      response = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForTimeout(500);
      const state = await page.evaluate(() => {
        const accessibleName = (element) =>
          element.getAttribute('aria-label') ||
          element.getAttribute('title') ||
          [...(element.labels || [])].map((label) => label.textContent?.trim()).filter(Boolean).join(' ') ||
          element.textContent?.trim() ||
          (element instanceof HTMLInputElement ? element.placeholder : '');
        const unnamed = [...document.querySelectorAll('button, a[href], input, select, textarea')]
          .filter((element) => !accessibleName(element))
          .map((element) => element.outerHTML.slice(0, 120));
        return {
          heading: document.querySelector('h1')?.textContent?.trim(),
          path: location.pathname,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          unnamed,
        };
      });
      if (!response?.ok()) failures.push(`${target.app}/${viewport.name}: HTTP ${response?.status()}`);
      if (state.heading !== target.heading) failures.push(`${target.app}/${viewport.name}: h1 ${state.heading}`);
      if (state.path !== target.path) failures.push(`${target.app}/${viewport.name}: ruta ${state.path}`);
      if (state.overflow) failures.push(`${target.app}/${viewport.name}: overflow horizontal`);
      if (state.unnamed.length) failures.push(`${target.app}/${viewport.name}: controles sin nombre`);
      if (pageErrors.length) failures.push(`${target.app}/${viewport.name}: pageerror ${pageErrors.join(' | ')}`);
      console.log(`${target.app}/${viewport.name}: HTTP ${response?.status()} h1=${state.heading} path=${state.path}`);
    } catch (error) {
      failures.push(`${target.app}/${viewport.name}: ${error.message}`);
    } finally {
      await page.close();
    }
  }
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

