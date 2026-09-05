import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Search, ShoppingBag, Utensils } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ProductRowSkeleton } from '@/components/common/Skeleton';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { ProductSheet } from '@/components/marketplace/ProductSheet';
import { storeService } from '@/lib/services';
import { cartTotals, useCartStore } from '@/store/cartStore';
import { FREE_DELIVERY_THRESHOLD } from '@/lib/commerce';
import { formatPrice } from '@/utils/format';
import { isStoreAcceptingOrders } from '@/utils/schedule';
import menuLogo from '@/assets/suya-menus-logo.png';
import type { Product } from '@/types';
import type { PublishedMenu } from '@/lib/services';

export default function MenuPage() {
  const { slug = '' } = useParams();
  const [menu, setMenu] = useState<PublishedMenu | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [section, setSection] = useState('Todos');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const items = useCartStore((state) => state.items);
  const cartStoreId = useCartStore((state) => state.storeId);
  const setOrigin = useCartStore((state) => state.setOrigin);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void storeService.getPublishedMenu(slug)
      .then(async (published) => {
        if (!active) return;
        if (!published) { setMenu(null); return; }
        const rows = await storeService.listProducts(published.store.id);
        if (active) { setMenu(published); setProducts(rows); setOrigin('suya_menu', slug); }
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'No pudimos cargar este menú.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [setOrigin, slug]);

  const sections = useMemo(() => ['Todos', ...new Set(products.map((product) => product.section))], [products]);
  const visible = useMemo(() => products.filter((product) => {
    const inSection = section === 'Todos' || product.section === section;
    const normalized = query.trim().toLocaleLowerCase('es');
    return inSection && (!normalized || `${product.name} ${product.description}`.toLocaleLowerCase('es').includes(normalized));
  }), [products, query, section]);

  if (loading) return <div className="shell space-y-3 py-10" role="status" aria-busy="true"><span className="sr-only">Cargando menú…</span>{Array.from({ length: 5 }).map((_, index) => <ProductRowSkeleton key={index} />)}</div>;
  if (error) return <div className="shell py-10"><ErrorState title="No pudimos abrir el menú" description={error} /></div>;
  if (!menu) return <div className="shell py-10"><EmptyState icon={<Utensils className="h-6 w-6" />} title="Menú no disponible" description="El enlace no existe o el restaurante todavía no publicó su carta." /></div>;

  const { store, brand } = menu;
  const open = isStoreAcceptingOrders(store);
  const ownCart = cartStoreId === store.id && items.length > 0;
  const totals = cartTotals(ownCart ? items : [], store, FREE_DELIVERY_THRESHOLD);
  const theme = { '--menu-primary': brand.primaryColor, '--menu-accent': brand.accentColor, fontFamily: brand.fontFamily } as CSSProperties;

  return (
    <div style={theme} className="min-h-screen bg-[#F8F5EE] pb-28 lg:pb-10">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <img src={menuLogo} alt="Suya Menús" className="h-12 w-auto object-contain sm:h-14" />
          <span className="rounded-full bg-[#0E6B44]/10 px-3 py-1.5 text-xs font-bold text-[#0E6B44]">{open ? 'Recibiendo pedidos' : 'Cerrado ahora'}</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:py-8">
        <aside className="lg:sticky lg:top-6 lg:self-start lg:overflow-hidden lg:rounded-3xl lg:bg-white lg:shadow-card">
          <div className="relative h-44 bg-[var(--menu-primary)] sm:h-52 lg:h-56">
            {brand.heroImageUrl || store.image ? <img src={brand.heroImageUrl ?? store.image ?? ''} alt={`Portada de ${store.name}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-[var(--menu-primary)] text-5xl font-black text-white/30">S</div>}
          </div>
          <div className="relative px-4 pb-5 sm:px-6 lg:px-5">
            <div className="-mt-10 h-20 w-20 overflow-hidden rounded-2xl border-4 border-[#F8F5EE] bg-white shadow-card lg:border-white">
              {brand.logoUrl || store.logo ? <img src={brand.logoUrl ?? store.logo ?? ''} alt={`Logo de ${store.name}`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-2xl font-black text-[var(--menu-primary)]">{store.name.slice(0, 1)}</div>}
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold text-suya-carbon lg:text-3xl">{store.name}</h1>
            <p className="mt-1 text-sm leading-6 text-[#626963]">{store.description}</p>
            <p className="mt-3 text-xs font-semibold text-[#626963]">{store.address}</p>
          </div>
        </aside>

        <section className="px-4 py-5 sm:px-6 lg:px-0 lg:py-0">
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 shadow-sm focus-within:ring-2 focus-within:ring-[var(--menu-primary)]">
            <Search className="h-5 w-5 text-[#707770]" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar platos o bebidas" aria-label="Buscar en el menú" />
          </div>
          <nav aria-label="Categorías del menú" className="hide-scrollbar mb-6 flex gap-2 overflow-x-auto pb-1">
            {sections.map((name) => <button key={name} type="button" onClick={() => setSection(name)} className={`h-11 shrink-0 rounded-full border px-5 text-sm font-semibold ${section === name ? 'border-[var(--menu-primary)] bg-[var(--menu-primary)] text-white' : 'border-black/10 bg-white text-suya-carbon'}`}>{name}</button>)}
          </nav>
          {visible.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((product) => <ProductCard key={product.id} product={product} disabled={!open} onSelect={setSelected} accentClassName="bg-[var(--menu-primary)] hover:brightness-90" />)}</div> : <EmptyState icon={<Utensils className="h-6 w-6" />} title="No hay resultados" description="Prueba otra búsqueda o categoría." />}
        </section>
      </main>

      {ownCart && <div className="fixed inset-x-0 bottom-4 z-30 px-4"><Link to="/cart" className="mx-auto flex max-w-xl items-center justify-between rounded-2xl bg-suya-carbon px-5 py-4 font-semibold text-white shadow-soft"><span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" />Ver pedido ({totals.count})</span><span>{formatPrice(totals.total)}</span></Link></div>}
      <ProductSheet product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
