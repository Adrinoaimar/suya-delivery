import { useEffect, useState } from 'react';
import { ArrowRight, QrCode, Store, Utensils } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { storeService, tableService } from '@/lib/services';
import type { Store as StoreModel } from '@/types';

export default function TableQrPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const [store, setStore] = useState<StoreModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState<{ tableNumber: string; restaurantId: string; tableId: string; sessionId: string | null } | null>(null);
  const tableNumber = params.get('table') ?? resolved?.tableNumber ?? null;
  const restaurantId = params.get('restaurant') ?? resolved?.restaurantId ?? null;

  useEffect(() => {
    let active = true;
    void tableService.resolve(token).then((table) => {
      if (table && active) setResolved({ tableNumber: table.tableNumber, restaurantId: table.restaurantId, tableId: table.tableId, sessionId: table.sessionId });
      return storeService.listStores();
    }).then((stores) => {
      if (!active) return;
      setStore(restaurantId ? stores.find((candidate) => candidate.id === restaurantId) ?? null : null);
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [restaurantId, token]);

  if (loading) return <div className="shell flex min-h-[65vh] items-center justify-center text-sm text-[#68716C]">Cargando mesa…</div>;
  if (failed) return <div className="shell py-10"><ErrorState title="No pudimos cargar esta mesa" description="Revisa tu conexión e intenta escanear el código nuevamente." /></div>;

  return <main className="shell flex min-h-[65vh] items-center justify-center py-10"><Card className="w-full max-w-lg overflow-hidden p-0">
    <div className="bg-suya-green px-6 py-8 text-white"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15"><QrCode className="h-7 w-7" aria-hidden="true" /></span><div><p className="text-sm text-white/75">Pedido en mesa</p><h1 className="font-display text-2xl font-bold">{store?.name ?? 'Suya Delivery'}</h1></div></div><p className="mt-6 text-lg font-semibold">Mesa {tableNumber || 'por identificar'}</p><p className="mt-1 text-sm text-white/80">Escanea, pide y agrega productos durante toda tu atención.</p></div>
    <div className="space-y-5 p-6">{!store ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Este QR todavía no está vinculado a un restaurante activo. Pide al encargado que genere nuevamente el QR desde Operaciones.</div> : <><div className="flex items-start gap-3"><Store className="mt-0.5 h-5 w-5 text-suya-green" aria-hidden="true" /><div><p className="font-semibold">{store.name}</p><p className="text-sm text-[#68716C]">{store.address}</p></div></div><div className="flex items-start gap-3"><Utensils className="mt-0.5 h-5 w-5 text-suya-green" aria-hidden="true" /><p className="text-sm text-[#68716C]">Tu pedido llegará directamente a cocina con el número de mesa.</p></div><ButtonLink onClick={() => { if (resolved) sessionStorage.setItem('suya.tableContext', JSON.stringify(resolved)); }} to={`/store/${store.id}?table=${encodeURIComponent(tableNumber ?? '')}&tableToken=${encodeURIComponent(token)}`} size="lg" className="w-full justify-center">Ver carta <ArrowRight className="h-4 w-4" aria-hidden="true" /></ButtonLink></>}<Link to="/" className="block text-center text-sm font-semibold text-suya-green hover:underline">Volver a Suya</Link></div>
  </Card></main>;
}
