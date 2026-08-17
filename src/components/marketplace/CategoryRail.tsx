import { Cake, Cross, CupSoda, LayoutGrid, ShoppingCart, Store, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
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
  className?: string;
}

/** Accesos por categoría. En móvil se desliza en horizontal; en escritorio es una grilla. */
export function CategoryRail({ categories, className }: CategoryRailProps) {
  return (
    <nav aria-label="Categorías" className={className}>
      <ul className="hide-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-7">
        {categories.map((category) => {
          const Icon = ICONS[category.icon] ?? Store;
          return (
            <li key={category.id} className="shrink-0">
              <Link
                to={`/stores?categoria=${category.id}`}
                className="press flex w-[86px] flex-col items-center gap-2 rounded-card border border-suya-mist bg-white p-3 text-center transition-colors hover:border-suya-lime sm:w-full"
              >
                <span
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full',
                    ACCENTS[category.accent],
                  )}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium leading-tight text-suya-carbon">
                  {category.name}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="shrink-0">
          <Link
            to="/stores"
            className="press flex w-[86px] flex-col items-center gap-2 rounded-card border border-suya-mist bg-white p-3 text-center transition-colors hover:border-suya-lime sm:w-full"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-suya-mist text-[#4A4F55]">
              <LayoutGrid aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="text-xs font-medium leading-tight text-suya-carbon">Más</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
