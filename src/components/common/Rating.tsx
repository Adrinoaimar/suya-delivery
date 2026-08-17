import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

interface RatingProps {
  value: number;
  reviews?: number;
  className?: string;
}

export function Rating({ value, reviews, className }: RatingProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-sm text-suya-carbon', className)}
      aria-label={`Calificación ${value.toFixed(1)} de 5${reviews ? `, ${reviews} reseñas` : ''}`}
    >
      <Star aria-hidden="true" className="h-4 w-4 fill-suya-sun text-suya-sun" />
      <span className="font-semibold tabular-nums">{value.toFixed(1)}</span>
      {reviews !== undefined && <span className="text-[#6B7076]">({reviews})</span>}
    </span>
  );
}
