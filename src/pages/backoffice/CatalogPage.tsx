import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, ImagePlus, RefreshCw, Save, Utensils } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Card } from '@/components/common/Card';
import { notifyCatalogInvalidated } from '@/lib/catalogSync';
import { notificationService, storeService } from '@/lib/services';
import type { MenuSettings } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import type { Product, Store } from '@/types';
import { assetUrl } from '@/utils/asset';
import { menuSlugFromName } from '@/utils/format';

const defaults = (store: Store): MenuSettings => ({
  restaurantId: store.id,
  slug: menuSlugFromName(store.name),
  published: false,
  logoUrl: store.logo,
  heroImageUrl: store.image,
  primaryColor: store.theme?.primary ?? '#EF6C3B',
  accentColor: store.theme?.accent ?? '#183B3B',
  fontFamily: 'Montserrat',
});

const normalizeFontFamily = (fontFamily: string): MenuSettings['fontFamily'] =>
  fontFamily.trim().toLowerCase() === 'montserrat' ? 'Montserrat' : 'Inter';

export default function CatalogPage() {
  const restaurantIds = useAuthStore((state) => state.identity?.restaurantIds ?? []);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Record<string, MenuSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owned = useMemo(() => stores.filter((store) => restaurantIds.includes(store.id)), [restaurantIds, stores]);
  const menuUrl = (slug: string) => `${import.meta.env.VITE_CUSTOMER_APP_URL || window.location.origin}/menu/${slug}`;
  const update = (id: string, patch: Partial<MenuSettings>) => setSettings((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const allStores = await storeService.listStores();
      const visible = allStores.filter((store) => restaurantIds.includes(store.id));
      const [rows, menuRows] = await Promise.all([
        Promise.all(visible.map((store) => storeService.listProducts(store.id))),
        Promise.all(visible.map(async (store) => {
          const current = await storeService.getMenuSettings(store.id);
          return [store.id, current ? { ...current, fontFamily: normalizeFontFamily(current.fontFamily) } : defaults(store)] as const;
        })),
      ]);
      setStores(allStores); setProducts(rows.flat()); setSettings(Object.fromEntries(menuRows));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo.'); }
    finally { setLoading(false); }
  }, [restaurantIds]);
  useEffect(() => { void load(); }, [load]);

  const save = async (storeId: string) => {
    const next = settings[storeId];
    if (!next || !/^[a-z0-9-]{3,80}$/.test(next.slug)) { notificationService.notify('El enlace solo admite letras minúsculas, números y guiones.', 'warning'); return; }
    setSaving(storeId);
    try {
      const currentStore = stores.find((store) => store.id === storeId);
      if (currentStore?.logo !== next.logoUrl) {
        await storeService.saveStoreLogo(storeId, next.logoUrl);
        setStores((current) => current.map((store) => store.id === storeId ? { ...store, logo: next.logoUrl } : store));
      }
      const saved = await storeService.saveMenuSettings(next);
      update(storeId, saved);
      notifyCatalogInvalidated();
      notificationService.notify(saved.published ? 'Menú publicado y logo actualizado.' : 'Configuración guardada y logo sincronizado.', 'success');
    }
    catch (cause) { notificationService.notify(cause instanceof Error ? cause.message : 'No se pudo guardar el menú.', 'danger'); }
    finally { setSaving(null); }
  };

  const upload = async (storeId: string, kind: 'logo' | 'hero', file?: File) => {
    if (!file) return; setSaving(storeId);
    try { const url = await storeService.uploadMenuImage(storeId, kind, file); update(storeId, kind === 'logo' ? { logoUrl: url } : { heroImageUrl: url }); notificationService.notify('Imagen cargada. Guarda los cambios para publicarla.', 'success'); }
    catch (cause) { notificationService.notify(cause instanceof Error ? cause.message : 'No se pudo cargar la imagen.', 'danger'); }
    finally { setSaving(null); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-suya-green">Suya Menús</p><h1 className="font-display text-2xl font-bold">Catálogo y publicación</h1><p className="mt-1 text-sm text-[#68716C]">Personaliza tu marca, publica el menú y comparte su QR.</p></div><button className="press inline-flex items-center gap-2 rounded-xl bg-suya-green px-4 py-2 text-sm font-semibold text-white" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" />Actualizar</button></div>
    {error && <Card className="border-red-200 text-sm text-red-700">{error}</Card>}
    {!loading && !error && owned.length === 0 && <Card className="flex min-h-64 flex-col items-center justify-center text-center"><Utensils className="h-10 w-10 text-suya-muted" /><h2 className="mt-3 font-display text-lg font-bold">No hay restaurantes asignados</h2><p className="mt-1 max-w-md text-sm text-[#68716C]">Un propietario o administrador debe vincular tu cuenta al restaurante.</p></Card>}
    <div className="space-y-5">{owned.map((store) => { const own = products.filter((product) => product.storeId === store.id); const menu = settings[store.id] ?? defaults(store); return <Card key={store.id} className="overflow-hidden p-0"><div className="grid lg:grid-cols-[1fr_280px]">
      <div className="space-y-5 p-4 sm:p-6"><div className="flex items-center gap-3">{assetUrl(menu.logoUrl) ? <img src={assetUrl(menu.logoUrl)} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-xl object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-xl bg-suya-ivory"><ImagePlus className="h-5 w-5 text-suya-muted" /></div>}<div><h2 className="font-display text-lg font-bold">{store.name}</h2><p className="text-xs text-[#68716C]">{own.length} platos disponibles</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Enlace público<input value={menu.slug} onChange={(event) => update(store.id, { slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className="mt-1 w-full rounded-xl border border-suya-mist px-3 py-2 font-normal" /></label><label className="text-sm font-semibold">Tipografía<select value={menu.fontFamily} onChange={(event) => update(store.id, { fontFamily: event.target.value })} className="mt-1 w-full rounded-xl border border-suya-mist px-3 py-2 font-normal"><option>Montserrat</option><option>Inter</option></select></label><label className="text-sm font-semibold">Color principal<input type="color" value={menu.primaryColor} onChange={(event) => update(store.id, { primaryColor: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-suya-mist p-1" /></label><label className="text-sm font-semibold">Color de acento<input type="color" value={menu.accentColor} onChange={(event) => update(store.id, { accentColor: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-suya-mist p-1" /></label><label className="text-sm font-semibold">URL del logo autorizado<input type="url" inputMode="url" value={menu.logoUrl ?? ''} onChange={(event) => update(store.id, { logoUrl: event.target.value })} placeholder="https://… o /brand/stores/logo.svg" className="mt-1 w-full rounded-xl border border-suya-mist px-3 py-2 font-normal" /></label><label className="text-sm font-semibold">URL de portada<input type="url" inputMode="url" value={menu.heroImageUrl ?? ''} onChange={(event) => update(store.id, { heroImageUrl: event.target.value })} placeholder="https://… o /images/stores/portada.webp" className="mt-1 w-full rounded-xl border border-suya-mist px-3 py-2 font-normal" /></label><label className="text-sm font-semibold">Logo JPG, PNG o WebP<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(store.id, 'logo', event.target.files?.[0])} className="mt-1 block w-full text-xs font-normal" /></label><label className="text-sm font-semibold">Portada JPG, PNG o WebP<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload(store.id, 'hero', event.target.files?.[0])} className="mt-1 block w-full text-xs font-normal" /></label></div>
      <div className="flex flex-wrap items-center gap-3"><label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={menu.published} onChange={(event) => update(store.id, { published: event.target.checked })} className="h-4 w-4 accent-suya-green" />Menú público</label><button onClick={() => void save(store.id)} disabled={saving === store.id} className="press inline-flex items-center gap-2 rounded-xl bg-suya-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save className="h-4 w-4" />{saving === store.id ? 'Guardando…' : 'Guardar y actualizar QR'}</button></div>
      {own.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">{own.slice(0, 6).map((product) => <li key={product.id} className="flex items-center gap-3 rounded-xl bg-suya-ivory p-3"><div className="h-10 w-10 overflow-hidden rounded-lg bg-white">{product.image && <img src={product.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{product.name}</p><p className="text-xs text-[#68716C]">S/ {product.price.toFixed(2)}</p></div></li>)}</ul>}</div>
      <aside className="flex flex-col items-center justify-center gap-3 border-t border-suya-mist bg-[#F7FAF8] p-6 text-center lg:border-l lg:border-t-0"><div className="rounded-2xl bg-white p-3 shadow-sm"><QRCodeSVG value={menuUrl(menu.slug)} size={176} level="H" includeMargin /></div><p className="text-xs font-semibold uppercase tracking-wider text-[#68716C]">QR del menú</p><p className="break-all text-xs text-[#68716C]">{menuUrl(menu.slug)}</p><a href={menuUrl(menu.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-suya-green"><ExternalLink className="h-4 w-4" />Abrir vista pública</a></aside>
    </div></Card>; })}</div>
    {loading && <Card className="p-8 text-center text-sm text-[#68716C]">Cargando catálogo real…</Card>}
  </div>;
}
