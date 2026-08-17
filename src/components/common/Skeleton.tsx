import { cn } from '@/lib/cn';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('skeleton rounded-md', className)} />;
}

export function StoreCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-suya-mist bg-white">
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="space-y-2 p-3.5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

export function ProductRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-card border border-suya-mist bg-white p-3">
      <Skeleton className="h-20 w-20 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}

export function TrackingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-48 w-full rounded-card" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-20 w-full rounded-card" />
    </div>
  );
}

export function StoreListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <StoreCardSkeleton key={index} />
      ))}
    </div>
  );
}
