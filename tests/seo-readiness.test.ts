import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('SEO local de Suya Delivery', () => {
  it('entrega contenido indexable y schema en el HTML inicial', () => {
    const html = source('apps/customer/index.html');

    expect(html).toContain('<link rel="canonical" href="https://suyadelivery.com/"');
    expect(html).toContain('index,follow,max-image-preview:large');
    expect(html).toContain('data-static-seo="home"');
    expect(html).toContain('<h1>Delivery en Sullana de restaurantes y tiendas locales</h1>');
    expect(html).toContain('"@type": "Service"');
    expect(html).toContain('"@type": "WebPage"');
  });

  it('mantiene un solo h1 en la portada React y contenido local útil', () => {
    const home = source('src/pages/customer/HomePage.tsx');
    const content = source('src/components/marketing/LocalDeliveryContent.tsx');

    expect(home.match(/<h1\b/g)).toHaveLength(1);
    expect(home).toContain('Delivery en Sullana, a un toque.');
    expect(content).toContain('¿Cómo pedir delivery en Sullana con Suya?');
    expect(content).toContain('política de privacidad');
  });

  it('prioriza las dos primeras portadas del listado visible de inicio', () => {
    const home = source('src/pages/customer/HomePage.tsx');
    const template = source('apps/customer/index.html');
    const generator = source('scripts/prepare-customer-seo.mjs');

    expect(home).toContain('featured.map((store, index) =>');
    expect(home).toContain('priorityImage={index < 2}');
    expect(template).toContain('cover-cevicheria-background.webp');
    expect(template).toContain('fetchpriority="high"');
    expect(generator).toContain('no precargarlas en rutas secundarias');
  });

  it('publica sitemap, robots y guía para rastreadores de IA', () => {
    const sitemap = source('public/sitemap.xml');
    const robots = source('public/robots.txt');
    const llms = source('public/llms.txt');

    for (const route of [
      '/delivery-sullana',
      '/comida-a-domicilio-sullana',
      '/restaurantes-delivery-sullana',
      '/nosotros',
      '/contacto',
      '/privacidad',
      '/terminos',
    ]) {
      expect(sitemap).toContain(`https://suyadelivery.com${route}/`);
    }
    expect(sitemap).toContain('<lastmod>2026-09-21</lastmod>');
    expect(robots).toContain('Sitemap: https://suyadelivery.com/sitemap.xml');
    expect(llms).toContain('# Suya Delivery');
    expect(llms).toContain('https://suyadelivery.com/stores');
  });

  it('genera HTML estático único para rutas públicas', () => {
    const generator = source('scripts/prepare-customer-seo.mjs');

    expect(generator).toContain('contenido SEO estático');
    expect(generator).toContain("title: `Menú de ${name} en Sullana | Suya Delivery`");
    expect(generator).toContain("breadcrumbs('stores', 'Restaurantes y tiendas en Sullana')");
    expect(generator).toContain("route: 'delivery-sullana'");
    expect(generator).toContain("route: 'comida-a-domicilio-sullana'");
    expect(generator).toContain("route: 'restaurantes-delivery-sullana'");
    expect(generator).toContain('renderNoIndexShell');
    expect(generator).toContain("path.join(customerDist, '404.html')");
    expect(generator).toContain('const canonical = `${siteOrigin}/${metadata.route}/`');
  });

  it('separa las rutas privadas y dinámicas del contenido indexable', () => {
    const redirects = source('public/_redirects');
    const store = source('src/pages/customer/StoreDetailPage.tsx');

    for (const route of ['/login', '/checkout', '/cart', '/orders', '/profile', '/search']) {
      expect(redirects).toContain(`${route} /_private 200`);
    }
    expect(redirects).toContain('/store/:id /_private 200');
    expect(redirects).toContain('/menu/:slug/pedido/:id /_private 200');
    expect(store).toMatch(/path={`\/store\/\${store\.id}`}\s+noIndex/);
  });

  it('evita que la animación de entrada bloquee la primera visita web', () => {
    const shell = source('src/app/AppShell.tsx');

    expect(shell).toContain('Capacitor.isNativePlatform() && intro.visible');
    expect(shell).toContain('{showIntro && (');
  });

  it('audita también los chunks JavaScript importados por el bundle principal', () => {
    const verifier = source('scripts/verify-live-production.mjs');

    expect(verifier).toContain('const pending = [...scriptSources]');
    expect(verifier).toContain('while (pending.length > 0 && inspected.size < 300)');
    expect(verifier).toContain('new URL(match[1], scriptUrl)');
  });
});
