import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const customerDist = path.join(repoRoot, 'dist', 'customer');
const siteOrigin = 'https://suyadelivery.com';

const organization = {
  '@type': 'Organization',
  '@id': `${siteOrigin}/#organization`,
  name: 'Suya Delivery',
  url: `${siteOrigin}/`,
  logo: `${siteOrigin}/brand/suya-logo.svg`,
  areaServed: { '@type': 'City', name: 'Sullana' },
};

const website = {
  '@type': 'WebSite',
  '@id': `${siteOrigin}/#website`,
  name: 'Suya Delivery',
  url: `${siteOrigin}/`,
  inLanguage: 'es-PE',
  publisher: { '@id': `${siteOrigin}/#organization` },
};

const routeMetadata = [
  {
    route: 'stores',
    title: 'Restaurantes y tiendas en Sullana | Suya',
    description:
      'Explora restaurantes, tiendas y negocios locales de Sullana. Filtra por categoría, horario, calificación y costo de envío en Suya Delivery.',
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        organization,
        website,
        {
          '@type': 'CollectionPage',
          name: 'Restaurantes y tiendas en Sullana',
          description:
            'Directorio de restaurantes, tiendas y negocios locales disponibles en Sullana.',
          url: `${siteOrigin}/stores`,
          isPartOf: { '@id': `${siteOrigin}/#website` },
          about: { '@type': 'City', name: 'Sullana' },
        },
      ],
    },
  },
  {
    route: 'help',
    title: 'Ayuda para pedidos y delivery en Sullana | Suya',
    description:
      'Encuentra respuestas sobre pedidos, pagos, seguimiento, privacidad y uso de Suya Delivery en Sullana.',
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        organization,
        website,
        {
          '@type': 'WebPage',
          name: 'Centro de ayuda de Suya Delivery',
          description:
            'Ayuda sobre pedidos, pagos, seguimiento y privacidad en Suya Delivery.',
          url: `${siteOrigin}/help`,
          isPartOf: { '@id': `${siteOrigin}/#website` },
        },
      ],
    },
  },
  ...[
    'anda-paya-menu',
    'anda-paya-cevicheria-menu',
    'donde-joel-menu',
    'tio-jhony-menu',
    'la-waka-menu',
  ].map((slug) => ({
    route: `menu/${slug}`,
    title: 'Menú digital en Sullana | Suya Delivery',
    description:
      'Consulta menús, platos y opciones de negocios locales de Sullana en Suya Delivery.',
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        organization,
        website,
        {
          '@type': 'WebPage',
          name: 'Menú digital en Sullana',
          description:
            'Menú digital de un negocio local disponible en Sullana mediante Suya Delivery.',
          url: `${siteOrigin}/menu/${slug}`,
          isPartOf: { '@id': `${siteOrigin}/#website` },
          about: { '@type': 'City', name: 'Sullana' },
        },
      ],
    },
  })),
];

function replaceOrThrow(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`No se pudo actualizar ${label} en el HTML cliente.`);
  return html.replace(pattern, replacement);
}

function renderRoute(template, metadata) {
  const canonical = `${siteOrigin}/${metadata.route}`;
  let html = template;
  html = replaceOrThrow(html, /<title>[^<]*<\/title>/, `<title>${metadata.title}</title>`, 'title');
  html = replaceOrThrow(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${metadata.description}" />`,
    'description',
  );
  html = replaceOrThrow(
    html,
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/>/,
    '<meta name="robots" content="index,follow" />',
    'robots',
  );
  html = replaceOrThrow(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${canonical}" />`,
    'canonical',
  );
  html = replaceOrThrow(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${metadata.title}" />`,
    'og:title',
  );
  html = replaceOrThrow(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${metadata.description}" />`,
    'og:description',
  );
  html = replaceOrThrow(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${canonical}" />`,
    'og:url',
  );
  html = replaceOrThrow(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${metadata.title}" />`,
    'twitter:title',
  );
  html = replaceOrThrow(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${metadata.description}" />`,
    'twitter:description',
  );
  html = replaceOrThrow(
    html,
    /<script\s+type="application\/ld\+json"\s+id="suya-seo-schema">[\s\S]*?<\/script>/,
    `<script type="application/ld+json" id="suya-seo-schema">${JSON.stringify(metadata.schema)}</script>`,
    'JSON-LD',
  );
  return html;
}

const template = await readFile(path.join(customerDist, 'index.html'), 'utf8');
for (const metadata of routeMetadata) {
  const output = path.join(customerDist, metadata.route, 'index.html');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, renderRoute(template, metadata));
}

console.log(`SEO estático generado para ${routeMetadata.length} rutas públicas del cliente.`);
