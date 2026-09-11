import { Cake, Cross, CupSoda, LayoutGrid, ShoppingCart, Store, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/common/Skeleton';
import { cn } from '@/lib/cn';
import type { Category } from '@/types';

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  'shopping-cart': ShoppingCart,
  cross: Cross,
  'cup-soda': CupSoda,
  cake: Cake,
  store: Store,
};

const ACCENTS = {
  green: 'bg-suya-green/10 text-suya-green',
  lime: 'bg-suya-lime-soft text-suya-green-dark',
  sun: 'bg-suya-sun-soft text-[#8A6100]',
};

interface CategoryRailProps {
  categories: Category[];
  /** Reserva el espacio del carril mientras llegan las categorías del catálogo. */
  loading?: boolean;
  className?: string;
}

/** Placeholders con la misma métrica que las fichas reales: el carril no salta al cargar. */
function CategoryRailSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <div className="hide-scrollbar -mx-4 flex gap-2.5 overflow-hidden px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:px-0 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="suya-lens-quiet flex w-[92px] shrink-0 flex-col items-center gap-2.5 rounded-promo px-2.5 py-3.5 sm:w-full"
          >
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <Skeleton className="h-3 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Accesos por categoría. En móvil se desliza en horizontal; en escritorio es una grilla. */
export function CategoryRail({ categories, loading = false, className }: CategoryRailProps) {
  if (loading && categories.length === 0) {
    return <CategoryRailSkeleton className={className} />;
  }

  const useCompactGrid = categories.length <= 3;

  return (
    <nav aria-label="Categorías" className={className}>
      <ul
        className={cn(
          'hide-scrollbar gap-2.5 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-7',
          useCompactGrid
            ? 'grid grid-cols-2 overflow-visible'
            : '-mx-4 flex overflow-x-auto px-4',
        )}
      >
        {categories.map((category) => {
          const Icon = ICONS[category.icon] ?? Store;
          return (
            <li key={category.id} className="shrink-0">
              <Link
                to={`/stores?categoria=${category.id}`}
                className={cn(
                  'suya-lens-quiet press group flex rounded-promo px-2.5 py-3.5 text-center transition-[border-color,background-color,transform,box-shadow] hover:border-suya-lime hover:bg-white/75 sm:w-full sm:flex-col sm:gap-2.5',
                  useCompactGrid
                    ? 'w-full flex-row items-center gap-3 text-left'
                    : 'w-[92px] flex-col items-center gap-2.5',
                )}
              >
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,.75)] transition-transform group-hover:scale-105',
                    ACCENTS[category.accent],
                  )}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold leading-tight text-suya-carbon">
                  {category.name}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="shrink-0">
          <Link
            to="/stores"
            className={cn(
              'suya-lens-quiet press group flex rounded-promo px-2.5 py-3.5 text-center transition-[border-color,background-color,transform,box-shadow] hover:border-suya-lime hover:bg-white/75 sm:w-full sm:flex-col sm:gap-2.5',
              useCompactGrid
                ? 'w-full flex-row items-center gap-3 text-left'
                : 'w-[92px] flex-col items-center gap-2.5',
            )}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-suya-mist text-[#4A4F55] shadow-[inset_0_1px_0_rgba(255,255,255,.75)] transition-transform group-hover:scale-105">
              <LayoutGrid aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold leading-tight text-suya-carbon">Más</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
