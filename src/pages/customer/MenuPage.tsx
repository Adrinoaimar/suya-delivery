import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Search, ShoppingBag, Utensils } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ProductRowSkeleton } from '@/components/common/Skeleton';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { ProductSheet } from '@/components/marketplace/ProductSheet';
import { loadPublicMenu } from '@/lib/loadPublicMenu';
import { cartTotals, useCartStore } from '@/store/cartStore';
import { FREE_DELIVERY_THRESHOLD } from '@/lib/commerce';
import { formatPrice } from '@/utils/format';
import { isStoreAcceptingOrders } from '@/utils/schedule';
import { assetUrl } from '@/utils/asset';
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
  const [reloadKey, setReloadKey] = useState(0);
  const items = useCartStore((state) => state.items);
  const cartStoreId = useCartStore((state) => state.storeId);
  const setOrigin = useCartStore((state) => state.setOrigin);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setProducts([]);
    void loadPublicMenu(slug)
      .then(({ menu: published, products: rows }) => {
        if (!active) return;
        if (!published) { setMenu(null); return; }
        setMenu(published);
        setProducts(rows);
        setOrigin('suya_menu', slug);
      })
      .catch(() => active && setError('Revisa tu conexión y vuelve a intentarlo.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reloadKey, setOrigin, slug]);

  const sections = useMemo(() => ['Todos', ...new Set(products.map((product) => product.section))], [products]);
  const visible = useMemo(() => products.filter((product) => {
    const inSection = section === 'Todos' || product.section === section;
    const normalized = query.trim().toLocaleLowerCase('es');
    return inSection && (!normalized || `${product.name} ${product.description}`.toLocaleLowerCase('es').includes(normalized));
  }), [products, query, section]);

  if (loading) return <div className="shell space-y-3 py-10" role="status" aria-busy="true"><span className="sr-only">Cargando menú…</span>{Array.from({ length: 5 }).map((_, index) => <ProductRowSkeleton key={index} />)}</div>;
  if (error) return <div className="shell py-10"><ErrorState title="No pudimos abrir el menú" description={error} onRetry={() => setReloadKey((value) => value + 1)} /></div>;
  if (!menu) return <div className="shell py-10"><EmptyState icon={<Utensils className="h-6 w-6" />} title="Menú no disponible" description="El enlace no existe o el restaurante todavía no publicó su carta." /></div>;

  const { store, brand } = menu;
  const open = isStoreAcceptingOrders(store);
  const ownCart = cartStoreId === store.id && items.length > 0;
  const totals = cartTotals(ownCart ? items : [], store, FREE_DELIVERY_THRESHOLD);
  // La identidad de Suya usa Montserrat para titulares e Inter para lectura. La configuración
  // antigua podía guardar familias que no están cargadas (DM Sans, Poppins, etc.); las reducimos
  // a una pila local conocida para evitar que el navegador caiga en una tipografía inesperada.
  const menuFont = brand.fontFamily.trim().toLowerCase() === 'montserrat'
    ? 'Montserrat, system-ui, sans-serif'
    : 'Inter, system-ui, sans-serif';
  const heroImage = assetUrl(brand.heroImageUrl
    || store.image
    || (store.name.toLocaleLowerCase('es') === 'andá paya' ? '/images/stores/anda-paya/arroz-mariscos.webp' : null));
  const logoImage = assetUrl(brand.logoUrl ?? store.logo);
  const theme = {
    '--menu-primary': brand.primaryColor || '#0E6B44',
    '--menu-accent': brand.accentColor || '#8CC63F',
    fontFamily: menuFont,
  } as CSSProperties;

  return (
    <div style={theme} className="min-h-screen bg-[#F8F5EE] pb-28 font-sans text-suya-carbon lg:pb-10">
      <header className="sticky top-0 z-20 border-b border-suya-carbon/5 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="Volver a Suya Delivery" className="rounded-xl transition-opacity hover:opacity-80">
            <img src={menuLogo} alt="Suya Menús" referrerPolicy="no-referrer" className="h-10 w-auto object-contain sm:h-11" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7D847E] sm:inline">Carta digital</span>
            <span role="status" className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${open ? 'bg-[#0E6B44]/10 text-[#0E6B44]' : 'bg-suya-carbon/10 text-suya-carbon'}`}>
              <span className={`h-2 w-2 rounded-full ${open ? 'bg-[#55A66C]' : 'bg-suya-carbon/40'}`} aria-hidden="true" />
              {open ? 'Recibiendo pedidos' : 'Cerrado ahora'}
            </span>
          </div>
        </div>
      </header>

      <main id="contenido" className="mx-auto max-w-7xl lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:py-8">
        <aside className="overflow-hidden border-b border-suya-carbon/5 bg-white lg:sticky lg:top-[92px] lg:self-start lg:rounded-3xl lg:border lg:shadow-card">
          <div className="relative h-48 bg-[var(--menu-primary)] sm:h-56 lg:h-60">
            {heroImage ? <img src={heroImage} alt={`Portada de ${store.name}`} referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-[var(--menu-primary)] text-6xl font-black text-white/30">S</div>}
            <div className="pointer-events-none absolute inset-0 bg-black/10" aria-hidden="true" />
            <span className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-suya-carbon">Menú público</span>
          </div>
          <div className="relative px-4 pb-6 sm:px-6 lg:px-5">
            <div className="-mt-10 h-20 w-20 overflow-hidden rounded-2xl border-4 border-[#F8F5EE] bg-white shadow-card lg:border-white">
              {logoImage ? <img src={logoImage} alt={`Logo de ${store.name}`} referrerPolicy="no-referrer" className="h-full w-full object-contain bg-white p-1" /> : <div className="grid h-full place-items-center text-2xl font-black text-[var(--menu-primary)]">{store.name.slice(0, 1)}</div>}
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--menu-primary)]">{store.tags[0] ?? 'Restaurante'}</p>
                <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-suya-carbon lg:text-[27px]">{store.name}</h1>
              </div>
              <span className="mt-1 shrink-0 rounded-full bg-suya-ivory px-2.5 py-1 text-[10px] font-semibold text-[#626963]">{store.etaMin}–{store.etaMax} min</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#626963]">{store.description}</p>
            <div className="mt-4 flex items-center gap-2 border-t border-suya-carbon/5 pt-4 text-xs font-semibold text-[#626963]">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-suya-ivory text-[var(--menu-primary)]" aria-hidden="true">⌖</span>
              <span className="truncate">{store.address || 'Ubicación por confirmar'}</span>
            </div>
          </div>
        </aside>

        <section className="px-4 py-7 sm:px-6 lg:px-0 lg:py-0">
          <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--menu-primary)]">Nuestra carta</p>
              <h2 className="mt-2 font-display text-3xl font-bold leading-tight tracking-[-0.03em] text-suya-carbon sm:text-4xl">Elige algo rico</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[#626963]">Todo preparado al momento. Agrega tus favoritos y envía tu pedido en pocos pasos.</p>
            </div>
            <span className="text-xs font-semibold text-[#7D847E]">{products.length} opciones disponibles</span>
          </div>
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-suya-carbon/10 bg-white px-4 shadow-card transition-shadow focus-within:border-[var(--menu-primary)] focus-within:shadow-soft">
            <Search className="h-5 w-5 shrink-0 text-[#707770]" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9AA09A]" placeholder="Buscar platos o bebidas" aria-label="Buscar en el menú" />
          </div>
          <nav aria-label="Categorías del menú" className="hide-scrollbar mb-8 flex gap-2 overflow-x-auto pb-1">
            {sections.map((name) => <button key={name} type="button" onClick={() => setSection(name)} aria-current={section === name ? 'page' : undefined} className={`h-11 shrink-0 rounded-full border px-5 text-sm font-semibold transition-colors ${section === name ? 'border-[var(--menu-primary)] bg-[var(--menu-primary)] text-white shadow-sm' : 'border-suya-carbon/10 bg-white text-suya-carbon hover:border-[var(--menu-primary)]'}`}>{name}</button>)}
          </nav>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h3 className="font-display text-xl font-bold text-suya-carbon">{section === 'Todos' ? 'Todos los platos' : section}</h3>
            <span className="text-xs font-medium text-[#7D847E]">{visible.length} {visible.length === 1 ? 'plato' : 'platos'}</span>
          </div>
          {visible.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{visible.map((product) => <ProductCard key={product.id} product={product} disabled={!open} onSelect={setSelected} accentClassName="bg-[var(--menu-primary)] hover:brightness-90" className="border-suya-carbon/10 p-3.5 shadow-none transition-all hover:-translate-y-0.5 hover:border-[var(--menu-primary)]/30 hover:shadow-soft" />)}</div> : <EmptyState icon={<Utensils className="h-6 w-6" />} title={products.length ? 'No hay resultados' : 'Carta sin productos'} description={products.length ? 'Prueba otra búsqueda o categoría.' : 'Este restaurante todavía no publicó platos disponibles.'} />}
        </section>
      </main>

      {ownCart && <div className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-30 px-4 lg:inset-x-auto lg:right-8 lg:w-[420px] lg:max-w-[calc(100vw-4rem)]"><Link to="/cart" className="mx-auto flex min-h-14 max-w-xl items-center justify-between rounded-2xl bg-suya-carbon px-5 py-4 font-semibold text-white shadow-soft transition-transform hover:-translate-y-0.5"><span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" />Ver pedido ({totals.count})</span><span>{formatPrice(totals.total)}</span></Link></div>}
      <ProductSheet product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
