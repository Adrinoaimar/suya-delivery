import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (path: string) => resolve(process.cwd(), path);

describe('activos de marca de restaurantes', () => {
  it('conserva activos publicados y la carta original de Andá Paya', () => {
    expect(existsSync(root('public/brand/stores/tio-jhony-logo.webp'))).toBe(true);
    expect(existsSync(root('public/brand/stores/la-waka-logo.webp'))).toBe(true);
    expect(existsSync(root('public/images/stores/donde-joel/logo.png'))).toBe(true);
    expect(existsSync(root('public/brand/stores/anda-paya-logo.webp'))).toBe(true);
    expect(existsSync(root('public/images/stores/anda-paya/menus/carta-2026-09-06.jpg'))).toBe(true);
    expect(existsSync(root('public/brand/stores/CREDITS.md'))).toBe(true);
  });

  it('deja un asset resoluble para cada ficha del catálogo local', () => {
    const stores = JSON.parse(readFileSync(root('src/data/stores.json'), 'utf8')) as Array<{
      id: string;
      logo?: string | null;
    }>;

    expect(stores).toHaveLength(13);
    expect(stores.every((store) => Boolean(store.logo))).toBe(true);
    for (const store of stores) {
      expect(existsSync(root(`public${store.logo!}`))).toBe(true);
    }
  });

  it('mantiene compactas las identidades gráficas locales para tarjetas móviles', () => {
    const compactMarks = [
      'el-buen-sabor-mark.svg',
      'don-pizza-mark.svg',
      'dulce-tentacion-mark.svg',
      'verde-fresh-mark.svg',
      'market-ahorro-mark.svg',
      'flores-del-chira-mark.svg',
      'juguetes-sullana-mark.svg',
    ];

    for (const file of compactMarks) {
      expect(readFileSync(root(`public/brand/stores/${file}`), 'utf8')).toContain('viewBox="0 0 512 512"');
    }
  });

  it('no vuelve a presentar el SVG recreado como identidad de Andá Paya', () => {
    const card = readFileSync(root('src/components/marketplace/StoreCard.tsx'), 'utf8');
    const detail = readFileSync(root('src/pages/customer/StoreDetailPage.tsx'), 'utf8');
    expect(card).not.toContain('anda-paya.svg');
    expect(detail).not.toContain('anda-paya.svg');
  });

  it('conecta el logo autorizado de Andá Paya al catálogo local', () => {
    const stores = JSON.parse(readFileSync(root('src/data/stores.json'), 'utf8')) as Array<{
      id: string;
      logo?: string | null;
      isRealBrand?: boolean;
    }>;
    const andaPaya = stores.find((store) => store.id === 'anda-paya');
    expect(andaPaya).toMatchObject({
      isRealBrand: true,
      logo: '/brand/stores/anda-paya-logo.webp',
    });
  });

  it('deja documentados los cuatro logos publicados en la migración operativa', () => {
    const migration = readFileSync(
      root('supabase/migrations/20260911130000_publish_donde_joel_brand_assets.sql'),
      'utf8',
    );
    expect(migration).toContain("'/images/stores/donde-joel/logo.png'");
    expect(readFileSync(root('supabase/migrations/20260912100000_refresh_la_waka_brand_assets.sql'), 'utf8'))
      .toContain("'/brand/stores/la-waka-logo.webp'");
    expect(readFileSync(root('supabase/migrations/20260911120000_publish_anda_paya_brand_assets.sql'), 'utf8'))
      .toContain("'/brand/stores/anda-paya-logo.webp'");
    expect(readFileSync(root('supabase/migrations/20260906150000_publish_tio_jhony_menu.sql'), 'utf8'))
      .toContain("'/brand/stores/tio-jhony-logo.webp'");
  });

  it('usa el logo de la ficha cuando una tienda no tiene portada', () => {
    const detail = readFileSync(root('src/pages/customer/StoreDetailPage.tsx'), 'utf8');
    expect(detail).toContain('const storeLogo = assetUrl(store.logo || store.gallery?.[0]?.src);');
    expect(detail).toContain('src={storeLogo}');
  });

  it('documenta la procedencia y el tratamiento de los logos refinados', () => {
    const credits = readFileSync(root('public/brand/stores/CREDITS.md'), 'utf8');
    expect(credits).toContain('lawakachicken.com/newlogo.png');
    expect(credits).toContain('carta-2026-09-06.jpg');
    expect(credits).toContain('fondo transparente');
  });
});
