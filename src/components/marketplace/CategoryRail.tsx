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
  green: 'bg-suya-lime-soft text-suya-green-dark',
  lime: 'bg-suya-lime/20 text-suya-green-dark',
  sun: 'bg-suya-sun-soft text-[#725303]',
  all: 'bg-suya-ivory text-suya-carbon',
};

const RAIL = 'hide-scrollbar -mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:gap-3 sm:px-0';
const TILE = 'min-w-[132px] max-w-[240px] flex-1 lg:flex-none lg:basis-48';
const LINK = 'press group flex min-h-16 items-center gap-2.5 rounded-btn px-2.5 py-2 text-[13px] font-bold leading-tight ring-inset hover:ring-1 hover:ring-suya-green/40 sm:gap-3 sm:px-3';
const ICON = 'suya-category-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 sm:h-10 sm:w-10';

interface CategoryRailProps {
  categories: Category[];
  loading?: boolean;
  className?: string;
}

export function CategoryRail({ categories, loading = false, className }: CategoryRailProps) {
  if (loading && categories.length === 0) {
    return (
      <div aria-hidden="true" className={cn(RAIL, className)}>
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} className={cn(TILE, 'h-16 rounded-btn')} />
        ))}
      </div>
    );
  }

  return (
    <nav aria-label="Categorías" className={className}>
      <ul className={RAIL}>
        {categories.map((category) => {
          const Icon = ICONS[category.icon] ?? Store;
          return (
            <li key={category.id} className={TILE}>
              <Link to={`/stores?categoria=${category.id}`} className={cn(LINK, ACCENTS[category.accent])}>
                <span className={ICON}><Icon aria-hidden="true" className="h-[19px] w-[19px]" /></span>
                {category.name}
              </Link>
            </li>
          );
        })}
        <li className={TILE}>
          <Link to="/stores" className={cn(LINK, ACCENTS.all)}>
            <span className={ICON}><LayoutGrid aria-hidden="true" className="h-[19px] w-[19px]" /></span>
            Todos los negocios
          </Link>
        </li>
      </ul>
    </nav>
  );
}
