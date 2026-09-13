import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const seed = readFileSync(resolve(root, 'supabase/seed.sql'), 'utf8');
const dondeJoelMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260906230000_donde_joel_menu_cards.sql'),
  'utf8',
);

const decodeSql = (value) => value.replaceAll("''", "'");
const slugify = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const items = [];
const andaPattern = /\('(?<id>30000000-0000-4000-8000-000000000(?<number>\d{3}))','20000000-0000-4000-8000-000000000001','(?<section>(?:''|[^'])*)','(?<name>(?:''|[^'])*)','(?<description>(?:''|[^'])*)',(?<price>\d+(?:\.\d+)?),/g;
for (const match of seed.matchAll(andaPattern)) {
  const number = match.groups.number;
  const name = decodeSql(match.groups.name);
  const target = `public/images/generated/anda-paya/ap-${number}-${slugify(name)}.webp`;
  items.push({
    restaurant: 'Andá Paya',
    restaurantSlug: 'anda-paya',
    productId: match.groups.id,
    section: decodeSql(match.groups.section),
    name,
    description: decodeSql(match.groups.description),
    price: Number(match.groups.price),
    target,
    mirrorFolder: 'Andá Paya',
    status: existsSync(resolve(root, target)) ? 'generated' : 'pending',
  });
}

const dondeJoelPattern = /\('(?<sourceKey>p\d{2}-\d{3})','(?<section>(?:''|[^'])*)','(?<name>(?:''|[^'])*)','(?<description>(?:''|[^'])*)',(?<price>\d+(?:\.\d+)?),(?<sortOrder>\d+)\)/g;
for (const match of dondeJoelMigration.matchAll(dondeJoelPattern)) {
  const name = decodeSql(match.groups.name);
  const target = `public/images/generated/donde-joel/dj-${match.groups.sourceKey}-${slugify(name)}.webp`;
  items.push({
    restaurant: 'Donde Joel',
    restaurantSlug: 'donde-joel',
    sourceKey: match.groups.sourceKey,
    section: decodeSql(match.groups.section),
    name,
    description: decodeSql(match.groups.description),
    price: Number(match.groups.price),
    sortOrder: Number(match.groups.sortOrder),
    target,
    mirrorFolder: 'Donde Joel',
    status: existsSync(resolve(root, target)) ? 'generated' : 'pending',
  });
}

const promoTarget = 'public/images/generated/donde-joel/promo-2-cuartos-broaster.webp';
items.unshift({
  restaurant: 'Donde Joel',
  restaurantSlug: 'donde-joel',
  productId: '24000000-0000-4000-8000-000000000001',
  section: 'Promociones',
  name: 'Promo: 2 cuartos de pollo broaster',
  description: 'Incluye dos cuartos de pollo broaster. Primer cuarto S/ 20 y segundo S/ 1.',
  price: 21,
  target: promoTarget,
  mirrorFolder: 'Donde Joel',
  status: existsSync(resolve(root, promoTarget)) ? 'generated' : 'pending',
});

if (items.length !== 192) {
  throw new Error(`Inventario incompleto: se esperaban 192 imágenes únicas y se hallaron ${items.length}.`);
}

const manifest = {
  version: 1,
  disclosure: 'Todas las imágenes son ilustrativas y generadas con IA; no son fotos del negocio.',
  uniqueImages: items.length,
  productLinks: 211,
  generated: items.filter((item) => item.status === 'generated').length,
  pending: items.filter((item) => item.status === 'pending').length,
  items,
};

writeFileSync(
  resolve(root, 'docs/data/ai-menu-images-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(`Imágenes: ${manifest.generated}/${manifest.uniqueImages}; pendientes: ${manifest.pending}`);
