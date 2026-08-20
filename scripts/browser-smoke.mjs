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

if (process.env.SMOKE_BUSINESS === 'true') {
  const customerOrigin = new URL(targets[0].url).origin;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    geolocation: { latitude: -4.903, longitude: -80.685 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`business/pageerror: ${error.message}`));
  try {
    const email = process.env.E2E_CUSTOMER_EMAIL ?? 'e2e.customer@suya.test';
    const password = process.env.E2E_CUSTOMER_PASSWORD ?? 'SuyaE2E!2026Local';
    await page.goto(`${customerOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña').fill(password);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.waitForURL(/\/profile|\/$/, { timeout: 20_000 });

    await page.goto(`${customerOrigin}/stores`, { waitUntil: 'networkidle', timeout: 20_000 });
    await page.getByRole('link', { name: 'Andá Paya' }).click();
    await page.getByRole('heading', { name: 'Andá Paya' }).waitFor();
    await page.getByRole('button', { name: 'Agregar Chicharrón de pescado' }).click();
    await page.getByRole('button', { name: /Agregar ·/ }).click();

    await page.goto(`${customerOrigin}/cart`, { waitUntil: 'networkidle', timeout: 20_000 });
    await page.getByRole('link', { name: 'Continuar al pago' }).click();
    await page.getByRole('heading', { name: 'Confirmar pedido' }).waitFor();
    await page.getByLabel('Nombre y apellido').fill('Cliente E2E Suya');
    await page.getByLabel('Teléfono').fill('987654321');
    await page.getByLabel('Dirección').fill('Av. José de Lama 480, Sullana');
    await page.getByRole('button', { name: 'Usar mi ubicación' }).click();
    await page.getByText('Punto confirmado:', { exact: false }).waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: /Confirmar pedido ·/ }).click();
    await page.waitForURL(/\/orders\/[^/]+\/track$/, { timeout: 20_000 });
    await page.getByRole('heading', { name: 'Pedido confirmado' }).waitFor({ timeout: 20_000 });
    const deliveryCode = await page.getByText(/^\d{4}$/, { exact: true }).first().innerText();
    console.log('business/customer-create-cash-order: OK');

    const backofficeOrigin = new URL(targets[2].url).origin;
    const riderOrigin = new URL(targets[1].url).origin;
    const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'e2e.admin@suya.test';
    const riderEmail = process.env.E2E_RIDER_EMAIL ?? 'e2e.rider@suya.test';
    const opsPage = await context.newPage();
    await opsPage.goto(`${backofficeOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await opsPage.getByLabel('Correo').fill(adminEmail);
    await opsPage.getByLabel('Contraseña').fill(password);
    await opsPage.getByRole('button', { name: 'Ingresar' }).click();
    await opsPage.waitForURL(/\/$|\/orders$/, { timeout: 20_000 });
    await opsPage.goto(`${backofficeOrigin}/orders`, { waitUntil: 'networkidle', timeout: 20_000 });
    await opsPage.getByRole('heading', { name: 'Pedidos' }).waitFor();
    await opsPage.locator('select').first().selectOption({ label: 'Repartidor E2E Suya · Moto' });
    await opsPage.getByRole('button', { name: 'Iniciar preparación' }).first().click();
    await opsPage.getByText('En preparación', { exact: true }).waitFor({ timeout: 20_000 });
    console.log('business/backoffice-assign-and-prepare: OK');

    const riderPage = await context.newPage();
    await riderPage.goto(`${riderOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await riderPage.getByLabel('Correo').fill(riderEmail);
    await riderPage.getByLabel('Contraseña').fill(password);
    await riderPage.getByRole('button', { name: 'Ingresar' }).click();
    await riderPage.waitForURL(/\/rider(?:\/current)?$/, { timeout: 20_000 });
    await riderPage.goto(`${riderOrigin}/rider/current`, { waitUntil: 'networkidle', timeout: 20_000 });
    await riderPage.getByRole('heading', { name: 'Viaje actual' }).waitFor();
    await riderPage.getByRole('button', { name: 'Recogí el pedido' }).click();
    await riderPage.getByText('Repartidor recogió pedido', { exact: true }).waitFor({ timeout: 20_000 });
    await riderPage.getByRole('button', { name: 'Voy en camino' }).click();
    await riderPage.getByText('En camino', { exact: true }).waitFor({ timeout: 20_000 });
    console.log('business/rider-advance-status: OK');

    await riderPage.goto(`${riderOrigin}/rider/safety`, { waitUntil: 'networkidle', timeout: 20_000 });
    await riderPage.getByRole('heading', { name: 'Seguridad en ruta' }).waitFor();
    await riderPage.getByText('GPS real activo', { exact: true }).waitFor({ timeout: 20_000 });
    await riderPage.getByRole('button', { name: 'SOS' }).click();
    await riderPage.getByRole('button', { name: 'Enviar alerta SOS' }).click();
    await riderPage.getByText('Alerta operativa activa', { exact: true }).waitFor({ timeout: 20_000 });
    await riderPage.getByRole('button', { name: 'Estoy bien, avisar a operaciones' }).click();
    await riderPage.getByRole('heading', { name: 'Reportar incidente' }).waitFor();
    await riderPage.getByLabel('Descripción').fill('Tráfico intenso en la ruta, sin riesgo para el pedido.');
    await riderPage.getByRole('button', { name: 'Registrar incidente' }).click();
    await riderPage.getByText('Incidentes registrados', { exact: true }).waitFor({ timeout: 20_000 });
    console.log('business/rider-gps-sos-incident: OK');

    await riderPage.goto(`${riderOrigin}/rider/current`, { waitUntil: 'networkidle', timeout: 20_000 });
    await riderPage.getByRole('button', { name: 'Entregué el pedido' }).click();
    await riderPage.locator('#codigo-pedido').fill(deliveryCode);
    await riderPage.getByRole('button', { name: 'Confirmar entrega' }).click();
    await riderPage.getByText('Entregado', { exact: true }).waitFor({ timeout: 20_000 });
    console.log('business/rider-confirm-delivery-code: OK');
    await opsPage.close();
    await riderPage.close();
  } catch (error) {
    failures.push(`business/customer-create-cash-order: ${error.message}`);
  } finally {
    await page.close();
    await context.close();
  }
}

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}


