import { ArrowRight, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import type { Promotion } from '@/types';

const ACCENTS = {
  green: 'bg-suya-green text-white',
  lime: 'bg-suya-lime-soft text-suya-green-dark',
  sun: 'bg-suya-sun text-suya-carbon',
};

interface PromoCardProps {
  promotion: Promotion;
  size?: 'sm' | 'lg';
  className?: string;
}

export function PromoCard({ promotion, size = 'sm', className }: PromoCardProps) {
  const to = promotion.storeId ? `/store/${promotion.storeId}` : '/stores';

  return (
    <Link
      to={to}
      className={cn(
        'press relative flex flex-col justify-between overflow-hidden rounded-promo p-4 shadow-card transition-shadow hover:shadow-soft',
        ACCENTS[promotion.accent],
        size === 'lg' ? 'min-h-[148px]' : 'min-h-[120px] w-[262px] shrink-0 sm:w-auto',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15"
      />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-90">
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          Promoción
        </span>
        <h3
          className={cn(
            'mt-1.5 font-display font-bold leading-tight',
            size === 'lg' ? 'text-xl' : 'text-base',
          )}
        >
          {promotion.title}
        </h3>
        <p className="mt-1 text-sm opacity-90">{promotion.subtitle}</p>
      </div>
      <span className="relative mt-3 inline-flex items-center gap-1.5 text-sm font-semibold">
        {promotion.code ? `Código ${promotion.code}` : 'Ver negocio'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
