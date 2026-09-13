import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Bike,
  CarFront,
  Check,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { notificationService, restaurantRiderService, storeService } from '@/lib/services';
import { useAuthStore } from '@/store/authStore';
import type { RestaurantRider } from '@/lib/services';
import type { Store } from '@/types';

type FormState = {
  email: string;
  displayName: string;
  phone: string;
  vehicleType: string;
  vehicleColor: string;
  vehiclePlate: string;
};

const emptyForm: FormState = {
  email: '',
  displayName: '',
  phone: '',
  vehicleType: 'Moto',
  vehicleColor: '',
  vehiclePlate: '',
};

const statusLabel: Record<RestaurantRider['status'], string> = {
  offline: 'Desconectado',
  available: 'Disponible',
  busy: 'En entrega',
  suspended: 'Suspendido',
};

function statusTone(status: RestaurantRider['status']): 'lime' | 'sun' | 'danger' | 'neutral' {
  if (status === 'available') return 'lime';
  if (status === 'busy') return 'sun';
  if (status === 'suspended') return 'danger';
  return 'neutral';
}

function vehicleLabel(rider: RestaurantRider): string {
  return (
    [rider.vehicleType, rider.vehicleColor, rider.vehiclePlate].filter(Boolean).join(' · ') ||
    'Vehículo por confirmar'
  );
}

export default function RidersOperationsPage() {
  const identity = useAuthStore((state) => state.identity);
  const restaurantIds = useMemo(() => identity?.restaurantIds ?? [], [identity?.restaurantIds]);
  const isPlatformAdmin = identity?.access.includes('platform_admin') ?? false;
  const [stores, setStores] = useState<Store[]>([]);
  const [restaurantId, setRestaurantId] = useState('');
  const [riders, setRiders] = useState<RestaurantRider[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allStores = await storeService.listStores();
      const visibleStores = allStores.filter(
        (store) => isPlatformAdmin || restaurantIds.includes(store.id),
      );
      const nextRestaurantId = isPlatformAdmin
        ? restaurantId && visibleStores.some((store) => store.id === restaurantId)
          ? restaurantId
          : (visibleStores[0]?.id ?? '')
        : restaurantIds.length === 1
          ? restaurantIds[0]
          : '';
      const nextRiders = nextRestaurantId
        ? await restaurantRiderService.list(nextRestaurantId)
        : [];
      setStores(visibleStores);
      setRestaurantId(nextRestaurantId);
      setRiders(nextRiders);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar los repartidores.');
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin, restaurantId, restaurantIds]);

  useEffect(() => {
    void load();
  }, [load]);

  const restaurant = stores.find((store) => store.id === restaurantId);
  const setField = (field: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!restaurantId) {
      notificationService.notify('Esta cuenta no tiene un restaurante único asignado.', 'warning');
      return;
    }
    setBusy('invite');
    try {
      const created = await restaurantRiderService.invite({ restaurantId, ...form });
      setRiders((current) => [created, ...current.filter((rider) => rider.id !== created.id)]);
      setForm(emptyForm);
      notificationService.notify(`${created.name} quedó agregado a la cuenta.`, 'success');
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos invitar al repartidor.',
        'danger',
      );
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (rider: RestaurantRider) => {
    setBusy(rider.id);
    try {
      const active = !rider.active;
      await restaurantRiderService.setActive(restaurantId, rider.id, active);
      setRiders((current) =>
        current.map((row) => (row.id === rider.id ? { ...row, active } : row)),
      );
      notificationService.notify(
        active
          ? 'Repartidor habilitado para esta cuenta.'
          : 'Repartidor deshabilitado para esta cuenta.',
        'success',
      );
    } catch (cause) {
      notificationService.notify(
        cause instanceof Error ? cause.message : 'No pudimos actualizar el repartidor.',
        'danger',
      );
    } finally {
      setBusy(null);
    }
  };

  if (error)
    return (
      <ErrorState
        title="No pudimos cargar repartidores"
        description={error}
        onRetry={() => void load()}
      />
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-suya-green">
            Operaciones
          </p>
          <h1 className="font-display text-2xl font-bold">Repartidores</h1>
          <p className="mt-1 max-w-2xl text-sm text-suya-muted">
            Invita y habilita repartidores para que la cuenta pueda asignarles pedidos.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {isPlatformAdmin && stores.length > 0 && (
        <Card className="border-suya-green/20">
          <label className="text-sm font-semibold">
            Cuenta de restaurante
            <select
              value={restaurantId}
              onChange={(event) => setRestaurantId(event.target.value)}
              className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-normal"
              aria-label="Cuenta de restaurante"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        </Card>
      )}

      {!loading && !restaurantId && (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Esta cuenta necesita un restaurante único"
          description="La cuenta de restaurante debe estar vinculada a un solo restaurante para poder gestionar sus repartidores."
        />
      )}

      {restaurantId && (
        <>
          <Card variant="glass" className="border-suya-green/20">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-suya-lime-soft p-3 text-suya-green">
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold">Agregar a {restaurant?.name ?? 'tu restaurante'}</p>
                <p className="mt-1 text-sm text-suya-muted">
                  Si es una cuenta nueva, recibirá una invitación por correo; si ya es repartidor,
                  se vinculará directamente. En ambos casos quedará asociado únicamente a esta cuenta.
                </p>
              </div>
            </div>
            <form
              className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(event) => void invite(event)}
            >
              <label className="text-sm font-semibold">
                Nombre completo
                <input
                  required
                  value={form.displayName}
                  onChange={(event) => setField('displayName', event.target.value)}
                  placeholder="Ej. Diego Ramírez"
                  className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal"
                />
              </label>
              <label className="text-sm font-semibold">
                Correo de acceso
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) => setField('email', event.target.value)}
                  placeholder="repartidor@correo.com"
                  className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal"
                />
              </label>
              <label className="text-sm font-semibold">
                Teléfono
                <input
                  value={form.phone}
                  onChange={(event) => setField('phone', event.target.value)}
                  placeholder="999 999 999"
                  className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal"
                />
              </label>
              <label className="text-sm font-semibold">
                Vehículo
                <input
                  value={form.vehicleType}
                  onChange={(event) => setField('vehicleType', event.target.value)}
                  placeholder="Moto, bici…"
                  className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal"
                />
              </label>
              <label className="text-sm font-semibold">
                Color
                <input
                  value={form.vehicleColor}
                  onChange={(event) => setField('vehicleColor', event.target.value)}
                  placeholder="Negro"
                  className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal"
                />
              </label>
              <label className="text-sm font-semibold">
                Placa
                <input
                  value={form.vehiclePlate}
                  onChange={(event) => setField('vehiclePlate', event.target.value)}
                  placeholder="ABC-123"
                  className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal"
                />
              </label>
              <div className="flex items-end sm:col-span-2 lg:col-span-3">
                <Button type="submit" disabled={busy === 'invite'}>
                  <Mail className="h-4 w-4" />
                  {busy === 'invite' ? 'Enviando…' : 'Invitar repartidor'}
                </Button>
              </div>
            </form>
          </Card>

          <section aria-labelledby="managed-riders-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bike className="h-5 w-5 text-suya-green" />
                <h2 id="managed-riders-title" className="font-display text-lg font-bold">
                  Repartidores de {restaurant?.name ?? 'la cuenta'}
                </h2>
              </div>
              <Badge tone="neutral">{riders.length} vinculados</Badge>
            </div>
            {!loading && riders.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Aún no hay repartidores"
                description="Invita al primer repartidor para que aparezca aquí y pueda recibir pedidos de esta cuenta."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {riders.map((rider) => (
                  <Card key={rider.id} className={!rider.active ? 'opacity-65' : ''}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-display text-lg font-bold">{rider.name}</h3>
                          <Badge tone={rider.active ? 'lime' : 'neutral'}>
                            {rider.active ? 'Habilitado' : 'Deshabilitado'}
                          </Badge>
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-suya-muted">
                          <Mail className="h-3.5 w-3.5" />
                          {rider.email}
                        </p>
                      </div>
                      <Badge tone={statusTone(rider.status)}>{statusLabel[rider.status]}</Badge>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      <p className="flex items-center gap-2 text-suya-muted">
                        <Phone className="h-4 w-4 text-suya-green" />
                        {rider.phone || 'Teléfono por confirmar'}
                      </p>
                      <p className="flex items-center gap-2 text-suya-muted">
                        <CarFront className="h-4 w-4 text-suya-green" />
                        {vehicleLabel(rider)}
                      </p>
                      <p className="text-suya-muted">
                        ★ {rider.rating.toFixed(1)} · {rider.deliveries} entregas
                      </p>
                      <p className="flex items-center gap-2 text-suya-muted">
                        {rider.verifiedAt ? (
                          <>
                            <ShieldCheck className="h-4 w-4 text-suya-green" />
                            Perfil verificado
                          </>
                        ) : (
                          'Perfil pendiente de verificación'
                        )}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-suya-mist pt-3">
                      <p className="text-xs text-suya-muted">
                        El vínculo solo afecta a {restaurant?.name ?? 'esta cuenta'}.
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void toggle(rider)}
                        disabled={busy === rider.id}
                      >
                        {rider.active ? 'Deshabilitar' : 'Habilitar'}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <Card className="flex items-start gap-3 bg-[#F7FAF8]">
        <Check className="mt-0.5 h-5 w-5 shrink-0 text-suya-green" />
        <p className="text-sm text-suya-muted">
          La cuenta solo puede listar y administrar los repartidores vinculados a su restaurante. La
          asignación de pedidos también valida este vínculo en el servidor.
        </p>
      </Card>
    </div>
  );
}
