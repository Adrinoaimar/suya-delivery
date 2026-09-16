import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { useOrderStore } from '@/store/orderStore';

export function LoadMoreOrders() {
  const hasMore = useOrderStore((state) => state.hasMore);
  const loadingMore = useOrderStore((state) => state.loadingMore);
  const loadMore = useOrderStore((state) => state.loadMore);

  if (!hasMore) return null;

  return (
    <div className="flex justify-center pt-2">
      <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
        {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loadingMore ? 'Cargando…' : 'Cargar más pedidos'}
      </Button>
    </div>
  );
}
