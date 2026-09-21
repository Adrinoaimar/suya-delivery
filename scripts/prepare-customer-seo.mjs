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
  description:
    'Plataforma local para pedir comida y compras de negocios incorporados en Sullana, Piura.',
  areaServed: {
    '@type': 'City',
    name: 'Sullana',
    containedInPlace: { '@type': 'AdministrativeArea', name: 'Piura, Perú' },
  },
};

const website = {
  '@type': 'WebSite',
  '@id': `${siteOrigin}/#website`,
  name: 'Suya Delivery',
  url: `${siteOrigin}/`,
  inLanguage: 'es-PE',
  publisher: { '@id': `${siteOrigin}/#organization` },
};

function breadcrumbs(route, name) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Inicio',
        item: `${siteOrigin}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name,
        item: `${siteOrigin}/${route}/`,
      },
    ],
  };
}

function staticPage({ key, eyebrow, title, paragraphs, links = [] }) {
  return `<main data-static-seo="${key}" class="shell py-8"><article><p>${eyebrow}</p><h1>${title}</h1>${paragraphs
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join('')}<nav aria-label="Enlaces relacionados">${links
    .map((link) => `<a href="${link.href}">${link.label}</a>`)
    .join('')}</nav></article></main>`;
}

const publicInfoRoutes = [
  {
    route: 'nosotros',
    title: 'Sobre Suya Delivery | Plataforma local de Sullana',
    description:
      'Conoce cómo Suya Delivery conecta clientes con restaurantes, tiendas y negocios incorporados de Sullana, Piura.',
    type: 'AboutPage',
    name: 'Sobre Suya Delivery',
    staticHtml: staticPage({
      key: 'about',
      eyebrow: 'Sobre Suya',
      title: 'Una plataforma de delivery creada para Sullana',
      paragraphs: [
        'Suya Delivery es una plataforma tecnológica local que reúne restaurantes, tiendas y otros negocios incorporados de Sullana, Piura.',
        'Conectamos catálogo, carrito, métodos de pago habilitados y seguimiento. La disponibilidad final depende del horario, catálogo y zona de cada comercio.',
      ],
      links: [
        { href: '/stores', label: 'Restaurantes y tiendas en Sullana' },
        { href: '/contacto', label: 'Contacto y ayuda' },
      ],
    }),
  },
  {
    route: 'contacto',
    title: 'Contacto y ayuda | Suya Delivery Sullana',
    description:
      'Encuentra los canales disponibles para resolver dudas sobre pedidos, pagos y negocios en Suya Delivery Sullana.',
    type: 'ContactPage',
    name: 'Contacto y ayuda de Suya Delivery',
    staticHtml: staticPage({
      key: 'contact',
      eyebrow: 'Contacto',
      title: 'Ayuda para clientes y negocios de Sullana',
      paragraphs: [
        'Consulta el estado de un pedido dentro de la plataforma. Suya todavía no publica un teléfono general ni un correo de soporte; no mostramos canales inexistentes.',
        'Para dudas sobre pagos, seguimiento o privacidad revisa el centro de ayuda. En una emergencia real usa los números oficiales 105 o 116.',
      ],
      links: [
        { href: '/help', label: 'Centro de ayuda' },
        { href: '/orders', label: 'Mis pedidos' },
      ],
    }),
  },
  {
    route: 'privacidad',
    title: 'Política de privacidad | Suya Delivery',
    description:
      'Consulta qué datos usa Suya Delivery para operar pedidos, pagos, ubicación y medición anónima de visitas.',
    type: 'WebPage',
    name: 'Política de privacidad de Suya Delivery',
    staticHtml: staticPage({
      key: 'privacy',
      eyebrow: 'Privacidad',
      title: 'Política de privacidad de Suya Delivery',
      paragraphs: [
        'Suya usa información necesaria para autenticar cuentas, preparar pedidos, verificar el método de pago elegido y coordinar entregas.',
        'La analítica pública es opcional. El contador diario no guarda IP, nombre, correo, ruta visitada ni contenido del pedido.',
      ],
      links: [{ href: '/contacto', label: 'Contacto y ayuda' }],
    }),
  },
  {
    route: 'terminos',
    title: 'Términos de uso | Suya Delivery',
    description:
      'Revisa las condiciones para usar el catálogo, los pedidos, pagos y seguimiento de Suya Delivery en Sullana.',
    type: 'WebPage',
    name: 'Términos de uso de Suya Delivery',
    staticHtml: staticPage({
      key: 'terms',
      eyebrow: 'Condiciones',
      title: 'Términos de uso de Suya Delivery',
      paragraphs: [
        'Revisa productos, cantidades, dirección, método de pago y total antes de confirmar un pedido.',
        'El catálogo, horarios, precios y zona disponible dependen de cada negocio incorporado y pueden cambiar.',
      ],
      links: [{ href: '/privacidad', label: 'Política de privacidad' }],
    }),
  },
].map((page) => ({
  ...page,
  schema: {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      website,
      {
        '@type': page.type,
        name: page.name,
        description: page.description,
        url: `${siteOrigin}/${page.route}/`,
        isPartOf: { '@id': `${siteOrigin}/#website` },
        inLanguage: 'es-PE',
      },
      breadcrumbs(page.route, page.name),
    ],
  },
}));

const menuRoutes = [
  { slug: 'anda-paya-menu', name: 'Anda Paya' },
  { slug: 'anda-paya-cevicheria-menu', name: 'Anda Paya Cevichería' },
  { slug: 'donde-joel-menu', name: 'Donde Joel' },
  { slug: 'tio-jhony-menu', name: 'El Tío Jhony' },
  { slug: 'la-waka-menu', name: 'La Waka' },
];

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
          url: `${siteOrigin}/stores/`,
          isPartOf: { '@id': `${siteOrigin}/#website` },
          about: { '@type': 'City', name: 'Sullana' },
        },
        breadcrumbs('stores', 'Restaurantes y tiendas en Sullana'),
      ],
    },
    staticHtml: staticPage({
      key: 'stores',
      eyebrow: 'Directorio local',
      title: 'Restaurantes y tiendas con delivery en Sullana',
      paragraphs: [
        'Explora negocios incorporados a Suya Delivery y revisa categorías, horario, calificación y costo de envío disponible.',
        'La disponibilidad depende del catálogo y la zona habilitada por cada comercio de Sullana.',
      ],
      links: [
        { href: '/', label: 'Delivery en Sullana' },
        { href: '/help', label: 'Ayuda para pedir' },
      ],
    }),
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
          url: `${siteOrigin}/help/`,
          isPartOf: { '@id': `${siteOrigin}/#website` },
        },
        breadcrumbs('help', 'Centro de ayuda'),
      ],
    },
    staticHtml: staticPage({
      key: 'help',
      eyebrow: 'Centro de ayuda',
      title: 'Ayuda para pedidos y delivery en Sullana',
      paragraphs: [
        'Consulta cómo hacer un pedido, revisar pagos habilitados, seguir una entrega y proteger tu ubicación.',
        'Suya muestra el total y la referencia del pago dentro del pedido. Verifica siempre el destinatario antes de confirmar.',
      ],
      links: [
        { href: '/stores', label: 'Ver restaurantes y tiendas' },
        { href: '/contacto', label: 'Contacto y ayuda' },
      ],
    }),
  },
  ...publicInfoRoutes,
  ...menuRoutes.map(({ slug, name }) => ({
    route: `menu/${slug}`,
    title: `Menú de ${name} en Sullana | Suya Delivery`,
    description:
      `Consulta la carta, platos y opciones disponibles de ${name} en Sullana mediante Suya Delivery.`,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        organization,
        website,
        {
          '@type': 'WebPage',
          name: `Menú de ${name} en Sullana`,
          description:
            `Carta digital de ${name} disponible en Sullana mediante Suya Delivery.`,
          url: `${siteOrigin}/menu/${slug}/`,
          isPartOf: { '@id': `${siteOrigin}/#website` },
          about: { '@type': 'Restaurant', name },
        },
        breadcrumbs(`menu/${slug}`, `Menú de ${name}`),
      ],
    },
    staticHtml: staticPage({
      key: `menu-${slug}`,
      eyebrow: 'Menú digital',
      title: `Menú de ${name} en Sullana`,
      paragraphs: [
        `Consulta la carta y las opciones disponibles de ${name}. Los productos, precios y horarios se actualizan según la información del negocio.`,
        'Revisa el total y los métodos de pago habilitados antes de confirmar tu pedido.',
      ],
      links: [
        { href: '/stores', label: 'Más restaurantes y tiendas en Sullana' },
        { href: '/help', label: 'Ayuda para pedir' },
      ],
    }),
  })),
];

function replaceOrThrow(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`No se pudo actualizar ${label} en el HTML cliente.`);
  return html.replace(pattern, replacement);
}

function renderRoute(template, metadata) {
  const canonical = `${siteOrigin}/${metadata.route}/`;
  // Las portadas destacadas solo son críticas en Inicio; no precargarlas en rutas secundarias.
  let html = template.replace(/\s*<link\s+rel="preload"\s+href="\/images\/stores\/[^>]+>/g, '');
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
    '<meta name="robots" content="index,follow,max-image-preview:large" />',
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
  html = replaceOrThrow(
    html,
    /<div id="root">[\s\S]*?<\/div>\s*<noscript>/,
    `<div id="root">${metadata.staticHtml}</div>\n    <noscript>`,
    'contenido SEO estático',
  );
  return html;
}

function renderNoIndexShell(template, { notFound = false } = {}) {
  const title = notFound ? 'Página no encontrada | Suya Delivery' : 'Área privada | Suya Delivery';
  const description = notFound
    ? 'La página solicitada no existe. Regresa al inicio de Suya Delivery.'
    : 'Área funcional de Suya Delivery no disponible para indexación pública.';
  const heading = notFound ? 'Página no encontrada' : 'Cargando Suya Delivery';
  let html = template.replace(/\s*<link\s+rel="preload"\s+href="\/images\/stores\/[^>]+>/g, '');
  html = replaceOrThrow(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`, 'title noindex');
  html = replaceOrThrow(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${description}" />`,
    'description noindex',
  );
  html = replaceOrThrow(
    html,
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/>/,
    '<meta name="robots" content="noindex,nofollow" />',
    'robots noindex',
  );
  html = html.replace(/\s*<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/, '');
  html = html.replace(/\s*<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/, '');
  html = replaceOrThrow(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${title}" />`,
    'og:title noindex',
  );
  html = replaceOrThrow(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${description}" />`,
    'og:description noindex',
  );
  html = replaceOrThrow(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${title}" />`,
    'twitter:title noindex',
  );
  html = replaceOrThrow(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${description}" />`,
    'twitter:description noindex',
  );
  html = html.replace(
    /\s*<script\s+type="application\/ld\+json"\s+id="suya-seo-schema">[\s\S]*?<\/script>/,
    '',
  );
  html = replaceOrThrow(
    html,
    /<div id="root">[\s\S]*?<\/div>\s*<noscript>/,
    `<div id="root"><main class="shell py-8"><h1>${heading}</h1><p>${description}</p></main></div>\n    <noscript>`,
    'contenido noindex',
  );
  return html;
}

const template = await readFile(path.join(customerDist, 'index.html'), 'utf8');
for (const metadata of routeMetadata) {
  const output = path.join(customerDist, metadata.route, 'index.html');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, renderRoute(template, metadata));
}

const privateShell = path.join(customerDist, '_private');
await writeFile(privateShell, renderNoIndexShell(template));
await writeFile(path.join(customerDist, '404.html'), renderNoIndexShell(template, { notFound: true }));

console.log(
  `SEO estático generado para ${routeMetadata.length} rutas públicas, rutas privadas noindex y 404 real.`,
);
