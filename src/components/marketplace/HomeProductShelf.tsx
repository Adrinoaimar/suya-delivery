import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight, CakeSlice, ChevronLeft, ChevronRight, CookingPot, CupSoda,
  Fish, Flame, Hamburger, LayoutGrid, Sandwich, Utensils,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorState } from '@/components/common/ErrorState';
import { Price } from '@/components/common/Price';
import { Skeleton } from '@/components/common/Skeleton';
import { Thumb } from '@/components/common/Thumb';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/lib/cn';
import { useCatalogStore } from '@/store/catalogStore';
import type { Product, Store } from '@/types';
import { normalize } from '@/utils/format';
import { isInformationalStore, isStoreAcceptingOrders } from '@/utils/schedule';

const ALL = { id: 'todo', label: 'Todo', Icon: LayoutGrid } as const;
const GROUPS = [
  { id: 'bebidas', label: 'Bebidas', Icon: CupSoda, sections: /bebida|jugo|gaseosa|infusion|jarra|refresco|cafe/ },
  { id: 'marinos', label: 'Ceviches y marinos', Icon: Fish, sections: /ceviche|marin|pescad|marisc/ },
  { id: 'arroces', label: 'Chaufas y arroces', Icon: CookingPot, sections: /chaufa|arro[zc]|mostrito/ },
  { id: 'criollos', label: 'Criollos y parrillas', Icon: Utensils, sections: /crioll|parrill|brasa|broaster|costill|selva|enchilada/ },
  { id: 'hamburguesas', label: 'Hamburguesas', Icon: Hamburger, sections: /hamburgues/ },
  { id: 'compartir', label: 'Para compartir', Icon: Sandwich, sections: /alita|ronda|piqueo|compartir|salchipapa|tequeno|entrada|papero|familiar|combo|brocheta/ },
  { id: 'postres', label: 'Postres', Icon: CakeSlice, sections: /postre|helad|pasteler|reposter/ },
] as const;

type CategoryId = typeof ALL.id | (typeof GROUPS)[number]['id'];
type ShelfItem = { product: Product; store: Store; category?: CategoryId; open: boolean };

function priority(item: ShelfItem) {
  return (item.open ? 16 : 0) + (item.product.image ? 4 : 0)
    + (item.product.image && !item.product.imageIsStock ? 2 : 0) + Number(item.product.popular);
}

function featuredItems(items: ShelfItem[]) {
  const chosen: ShelfItem[] = [];
  const categories = new Set<CategoryId>();
  // Abre con una selección variada de productos con foto, si el negocio está atendiendo.
  for (const item of items) {
    if (!item.open || !item.product.image || !item.category || categories.has(item.category)) continue;
    chosen.push(item);
    categories.add(item.category);
    if (chosen.length === 4) break;
  }
  const featuredIds = new Set(chosen.map(({ product }) => product.id));
  return [...chosen, ...items.filter(({ product }) => !featuredIds.has(product.id))];
}

const stepButton = 'press grid size-11 shrink-0 place-items-center rounded-full border border-suya-border bg-white text-suya-green-dark transition-colors enabled:hover:border-suya-green/40 enabled:hover:bg-suya-lime-soft disabled:opacity-35';

export function HomeProductShelf() {
  const stores = useCatalogStore((state) => state.stores);
  const storesStatus = useCatalogStore((state) => state.storesStatus);
  const menus = useCatalogStore((state) => state.productsByStore);
  const menuStatus = useCatalogStore((state) => state.productsStatus);
  const loadProducts = useCatalogStore((state) => state.loadProducts);
  const shops = useMemo(() => stores.filter((store) => !isInformationalStore(store)), [stores]);
  const [category, setCategory] = useState<CategoryId>('todo');
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });
  const rail = useRef<HTMLUListElement>(null);
  const railId = useId();
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (storesStatus !== 'ready') return;
    for (const shop of shops) void loadProducts(shop.id);
  }, [loadProducts, shops, storesStatus]);

  const items = useMemo(() => shops.flatMap((store) => {
    const open = isStoreAcceptingOrders(store);
    return (menus[store.id] ?? []).flatMap((product): ShelfItem[] => {
      const section = normalize(product.section);
      if (/^(adicionales|guarniciones)$/.test(section)) return [];
      return [{ product, store, open, category: GROUPS.find((group) => group.sections.test(section))?.id }];
    });
  }).sort((left, right) => priority(right) - priority(left)), [menus, shops]);

  const available = new Set(items.map((item) => item.category));
  const active = category !== 'todo' && available.has(category) ? category : 'todo';
  const visibleItems = useMemo(() => (
    active === 'todo' ? featuredItems(items) : items.filter((item) => item.category === active)
  ).slice(0, 18), [active, items]);
  const loading = storesStatus === 'loading' || storesStatus === 'idle'
    || shops.some(({ id }) => !menuStatus[id] || menuStatus[id] === 'loading');
  const failed = shops.some(({ id }) => menuStatus[id] === 'error');

  useEffect(() => {
    const list = rail.current;
    if (!list) return;
    list.scrollTo({ left: 0, behavior: 'instant' });
  }, [active]);

  useEffect(() => {
    const list = rail.current;
    if (!list) return;
    function syncEdges() {
      if (!list) return;
      const atStart = list.scrollLeft <= 2;
      const atEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
      setEdges((previous) => previous.atStart === atStart && previous.atEnd === atEnd ? previous : { atStart, atEnd });
    }
    syncEdges();
    list.addEventListener('scroll', syncEdges, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncEdges);
    observer?.observe(list);
    return () => {
      observer?.disconnect();
      list.removeEventListener('scroll', syncEdges);
    };
  }, [visibleItems]);

  function move(direction: number) {
    const list = rail.current;
    const cards = list?.querySelectorAll('li');
    if (!list || !cards?.[0] || !cards[1]) return;
    const start = cards[0].offsetLeft;
    const step = cards[1].offsetLeft - start;
    const page = Math.max(1, Math.floor(list.clientWidth / step));
    const current = Math.round(list.scrollLeft / step);
    const end = list.scrollWidth - list.clientWidth;
    // El último tramo puede terminar entre dos tarjetas en pantallas anchas.
    const left = Math.min(end, Math.max(0, (current + direction * page) * step));
    list.scrollTo({ left, behavior: reducedMotion ? 'instant' : 'smooth' });
  }

  if (storesStatus === 'error' || (!loading && !failed && items.length === 0)) return null;

  return (
    <section id="productos" aria-labelledby="home-products-title" className="home-product-shelf min-w-0 scroll-mt-24 rounded-promo bg-suya-ivory p-3 min-[390px]:p-4 sm:p-6 lg:p-7">
      <div className="mb-1 flex min-h-11 items-center justify-between gap-2 sm:mb-3">
        <h2 id="home-products-title" className="flex items-center gap-2 font-display text-[19px] font-bold leading-tight tracking-tight min-[390px]:text-xl sm:gap-3 sm:text-3xl">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-suya-sun-soft text-suya-green-dark sm:size-10">
            <Flame aria-hidden="true" size={18} />
          </span>
          ¿Qué se te antoja?
        </h2>
        {visibleItems.length > 1 && (
          <div className="flex shrink-0 gap-1.5">
            <button type="button" className={stepButton} aria-label="Productos anteriores" aria-controls={railId} disabled={edges.atStart} onClick={() => move(-1)}>
              <ChevronLeft aria-hidden="true" size={19} />
            </button>
            <button type="button" className={stepButton} aria-label="Más productos" aria-controls={railId} disabled={edges.atEnd} onClick={() => move(1)}>
              <ChevronRight aria-hidden="true" size={19} />
            </button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div role="group" aria-label="Categorías de productos" className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1 sm:flex-wrap">
          {[ALL, ...GROUPS.filter((group) => available.has(group.id))].map(({ id, label, Icon }) => (
            <button
              key={id} type="button" aria-pressed={active === id} aria-controls={railId} onClick={() => setCategory(id)}
              className={cn(
                'press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors sm:px-4',
                active === id
                  ? 'border-suya-green-dark bg-suya-green-dark text-white'
                  : 'border-suya-border bg-white text-suya-green-dark hover:border-suya-green/40 hover:bg-suya-lime-soft',
              )}
            >
              <Icon aria-hidden="true" size={16} /> {label}
            </button>
          ))}
        </div>
      )}

      {visibleItems.length ? (
        <ul ref={rail} id={railId} aria-label="Productos de la categoría seleccionada" className="home-product-rail hide-scrollbar -mx-1 mt-2 px-1 py-1 sm:mt-3">
          {visibleItems.map(({ product, store, open, category: productCategory }) => (
            <li key={product.id} className="min-w-0 snap-start">
              <Link
                to={`/store/${store.id}?producto=${encodeURIComponent(product.id)}`}
                aria-label={`${product.name} en ${store.name}`}
                className="home-product-card press group flex h-full flex-col rounded-card bg-white p-2 focus-visible:outline-offset-2"
              >
                <div className="home-product-media relative aspect-[1.34] overflow-hidden rounded-xl bg-suya-lime-soft">
                  {product.image ? (
                    <Thumb name={product.name} src={product.image} variant="product" rounded="rounded-none" className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-105" />
                  ) : (
                    <div aria-hidden="true" className="grid h-full place-items-center bg-suya-lime-soft text-suya-green">
                      <span className="grid size-12 place-items-center rounded-full bg-white/75">
                        {productCategory === 'bebidas' ? <CupSoda size={22} /> : <Utensils size={22} />}
                      </span>
                    </div>
                  )}
                  {product.image && product.imageIsStock && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white">
                      Foto ilustrativa
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col px-1 pb-0.5 pt-2.5">
                  <h3 className="line-clamp-2 font-display text-[13px] font-bold leading-snug sm:text-[15px]">{product.name}</h3>
                  <p className="mt-0.5 truncate text-xs text-suya-muted">{store.name}</p>
                  <div className="mt-auto flex items-center justify-between gap-1.5 pt-2">
                    <Price value={product.price} size="sm" />
                    {open ? (
                      <ArrowUpRight aria-hidden="true" size={18} className="shrink-0 text-suya-green" />
                    ) : (
                      <span className="text-xs font-semibold text-suya-muted">Cerrado</span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : loading ? (
        <div role="status" aria-busy="true" className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <span className="sr-only">Cargando productos…</span>
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className={cn('h-[160px] rounded-card sm:h-52', index > 1 && 'hidden sm:block', index === 4 && 'sm:hidden lg:block')} />
          ))}
        </div>
      ) : (
        <ErrorState description="No pudimos cargar los productos." onRetry={() => {
          for (const shop of shops) if (menuStatus[shop.id] === 'error') void loadProducts(shop.id, true);
        }} />
      )}
    </section>
  );
}
