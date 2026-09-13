import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Plus, RefreshCw, Tag, ToggleLeft } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { Input, Textarea } from '@/components/common/Input';
import { notificationService, offerService, storeService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import { formatPrice } from '@/utils/format';
import type { AppOffer } from '@/types';
import type { Store } from '@/types';

function localDateTime(daysFromNow = 0): string {
  const date = new Date(Date.now() + daysFromNow * 86400000);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

type OfferForm = {
  restaurantId: string;
  title: string;
  description: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  minimumSubtotal: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
};

const initialForm: OfferForm = {
  restaurantId: '',
  title: '',
  description: '',
  code: '',
  discountType: 'percent' as const,
  discountValue: '10',
  minimumSubtotal: '0',
  startsAt: localDateTime(),
  endsAt: localDateTime(7),
  maxRedemptions: '',
};

export default function OffersPage() {
  const identity = useAuthStore((state) => state.identity);
  const restaurantIds = useMemo(() => identity?.restaurantIds ?? [], [identity?.restaurantIds]);
  const isPlatformAdmin = identity?.access.includes('platform_admin') ?? false;
  const [offers, setOffers] = useState<AppOffer[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, allStores] = await Promise.all([
        offerService.listManageable(),
        storeService.listStores(),
      ]);
      setOffers(rows);
      setStores(allStores.filter((store) => isPlatformAdmin || restaurantIds.includes(store.id)));
      setForm((current) => ({
        ...current,
        restaurantId: current.restaurantId || restaurantIds[0] || '',
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las ofertas.');
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin, restaurantIds]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = <K extends keyof OfferForm>(key: K, value: OfferForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function create() {
    const title = form.title.trim();
    const code = form.code.trim().toUpperCase();
    const discountValue = Number(form.discountValue);
    const minimumSubtotal = Number(form.minimumSubtotal);
    if (title.length < 3 || !/^[A-Z0-9-]{3,30}$/.test(code)) {
      notificationService.notify(
        'Completa título y un código válido (3–30 caracteres).',
        'warning',
      );
      return;
    }
    if (
      !Number.isFinite(discountValue) ||
      discountValue <= 0 ||
      (form.discountType === 'percent' && discountValue > 100)
    ) {
      notificationService.notify('El descuento no es válido.', 'warning');
      return;
    }
    if (!form.endsAt || new Date(form.endsAt) <= new Date(form.startsAt)) {
      notificationService.notify('La fecha final debe ser posterior a la inicial.', 'warning');
      return;
    }
    if (!isPlatformAdmin && !form.restaurantId) {
      notificationService.notify('Selecciona un restaurante.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const offer = await offerService.create({
        restaurantId: form.restaurantId || null,
        title,
        description: form.description.trim(),
        code,
        discountType: form.discountType,
        discountValue,
        minimumSubtotal: Number.isFinite(minimumSubtotal) ? minimumSubtotal : 0,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        maxRedemptions: form.maxRedemptions ? Math.max(1, Number(form.maxRedemptions)) : null,
      });
      setOffers((current) => [offer, ...current]);
      setForm({ ...initialForm, restaurantId: form.restaurantId });
      notificationService.notify('Oferta exclusiva creada.', 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No se pudo crear la oferta.',
        'danger',
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggle(offer: AppOffer) {
    try {
      await offerService.setActive(offer.id, !offer.active);
      setOffers((current) =>
        current.map((row) => (row.id === offer.id ? { ...row, active: !offer.active } : row)),
      );
      notificationService.notify(
        offer.active ? 'Oferta desactivada.' : 'Oferta activada.',
        'success',
      );
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No se pudo actualizar la oferta.',
        'danger',
      );
    }
  }

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-suya-green">
            App Suya
          </p>
          <h1 className="font-display text-2xl font-bold">Ofertas exclusivas</h1>
          <p className="mt-1 text-sm text-[#68716C]">
            Publica beneficios visibles en la app y validados al confirmar el pedido.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      </div>
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-suya-green" />
          <h2 className="font-display text-lg font-bold">Nueva oferta</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Título"
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="10% para nuevos clientes"
            maxLength={120}
          />
          <Input
            label="Código"
            value={form.code}
            onChange={(event) => update('code', event.target.value.toUpperCase())}
            placeholder="SUYA10"
            maxLength={30}
          />
          <Textarea
            label="Descripción"
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="Válida solo desde la app Suya."
            maxLength={500}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Restaurante
            <select
              className="h-12 rounded-btn border border-suya-mist bg-white px-3.5"
              value={form.restaurantId}
              onChange={(event) => update('restaurantId', event.target.value)}
            >
              <option value="">{isPlatformAdmin ? 'Todos los restaurantes' : 'Selecciona…'}</option>
              {stores.map((store) => (
                <option value={store.id} key={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Tipo de descuento
            <select
              className="h-12 rounded-btn border border-suya-mist bg-white px-3.5"
              value={form.discountType}
              onChange={(event) =>
                update('discountType', event.target.value as 'percent' | 'fixed')
              }
            >
              <option value="percent">Porcentaje</option>
              <option value="fixed">Monto fijo</option>
            </select>
          </label>
          <Input
            label="Valor"
            type="number"
            min="0.01"
            step="0.01"
            value={form.discountValue}
            onChange={(event) => update('discountValue', event.target.value)}
          />
          <Input
            label="Compra mínima (S/)"
            type="number"
            min="0"
            step="0.01"
            value={form.minimumSubtotal}
            onChange={(event) => update('minimumSubtotal', event.target.value)}
          />
          <Input
            label="Inicio"
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => update('startsAt', event.target.value)}
          />
          <Input
            label="Fin"
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) => update('endsAt', event.target.value)}
          />
          <Input
            label="Límite de usos (opcional)"
            type="number"
            min="1"
            step="1"
            value={form.maxRedemptions}
            onChange={(event) => update('maxRedemptions', event.target.value)}
          />
        </div>
        <Button onClick={() => void create()} disabled={saving}>
          <Plus className="h-4 w-4" />
          {saving ? 'Creando…' : 'Crear oferta exclusiva'}
        </Button>
      </Card>
      <div className="space-y-3">
        {loading ? (
          <Card role="status" className="p-8 text-center text-sm text-[#68716C]">
            Cargando ofertas…
          </Card>
        ) : offers.length === 0 ? (
          <Card className="border-dashed py-10 text-center text-sm text-[#68716C]">
            Todavía no hay ofertas configuradas.
          </Card>
        ) : null}
        {offers.map((offer) => (
          <Card key={offer.id} className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display font-bold">{offer.title}</h2>
                <span className="rounded-full bg-suya-lime-soft px-2 py-0.5 text-xs font-bold text-suya-green-dark">
                  {offer.code}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${offer.active ? 'bg-suya-lime-soft text-suya-green-dark' : 'bg-[#E9EEEB] text-[#68716C]'}`}
                >
                  {offer.active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#68716C]">
                {offer.description || 'Oferta exclusiva de la app.'} ·{' '}
                {offer.discountType === 'percent'
                  ? `${offer.discountValue}%`
                  : formatPrice(offer.discountValue)}{' '}
                de descuento
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-[#68716C]">
                <CalendarClock className="h-3.5 w-3.5" />
                Hasta {new Date(offer.endsAt).toLocaleDateString('es-PE')} · {offer.redeemedCount}
                {offer.maxRedemptions ? `/${offer.maxRedemptions}` : ''} usos
              </p>
            </div>
            <Button variant="ghost" onClick={() => void toggle(offer)}>
              <ToggleLeft className="h-4 w-4" />
              {offer.active ? 'Desactivar' : 'Activar'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
