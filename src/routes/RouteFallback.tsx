import { StoreListSkeleton } from '@/components/common/Skeleton';

export function RouteFallback() {
  return (
    <div className="shell py-6">
      <StoreListSkeleton count={6} />
    </div>
  );
}
