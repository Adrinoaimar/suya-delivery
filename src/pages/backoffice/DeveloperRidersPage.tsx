import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import {
  developerRiderAccountService,
  notificationService,
  restaurantRiderService,
  storeService,
} from '@/lib/services';
import type { RestaurantRider } from '@/lib/services';
import type { Store } from '@/types';

type CredentialNotice = { email: string; password: string; action: 'created' | 'reset' };

const emptyForm = {
  email: '',
  displayName: '',
  phone: '',
  vehicleType: 'Moto',
  vehicleColor: '',
  vehiclePlate: '',
};

function newPassword(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Este navegador no permite generar una clave segura.');
  return globalThis.crypto.randomUUID().replaceAll('-', '');
}

function defaultEmail(storeName: string): string {
  if (storeName === 'Andá Paya Restaurante') return 'rider.andapaya.restaurante@suyadelivery.com';
  if (storeName === 'Andá Paya Cevichería') return 'rider.andapaya.cevicheria@suyadelivery.com';
  return '';
}

export default function DeveloperRidersPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [riders, setRiders] = useState<RestaurantRider[]>([]);
  const [riderId, setRiderId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [createPassword, setCreatePassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [notice, setNotice] = useState<CredentialNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [ridersLoading, setRidersLoading] = useState(false);
  const [busy, setBusy] = useState<'create' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedRider = riders.find((rider) => rider.id === riderId);
  const activeRiders = useMemo(() => riders.filter((rider) => rider.active), [riders]);

  useEffect(() => {
    let current = true;
    void storeService.listStores().then((rows) => {
      if (!current) return;
      setStores(rows);
      const defaultStore = rows.find((store) => store.name === 'Andá Paya Restaurante') ?? rows[0];
      setStoreId(defaultStore?.id ?? '');
      if (defaultStore) {
        setForm((value) => ({
          ...value,
          email: defaultEmail(defaultStore.name),
          displayName: `Repartidor ${defaultStore.name}`,
        }));
      }
      setError(null);
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las cuentas.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    setRiders([]);
    setRiderId('');
    if (!storeId) return () => { current = false; };
    setRidersLoading(true);
    void restaurantRiderService.list(storeId).then((rows) => {
      if (!current) return;
      const active = rows.filter((rider) => rider.active);
      setRiders(active);
      setRiderId(active[0]?.id ?? '');
    }).catch((cause: unknown) => {
      if (current) notificationService.notify(
        cause instanceof Error ? cause.message : 'No se pudieron cargar los riders.',
        'danger',
      );
    }).finally(() => {
      if (current) setRidersLoading(false);
    });
    return () => { current = false; };
  }, [storeId]);

  const changeStore = (nextId: string) => {
    const nextStore = stores.find((store) => store.id === nextId);
    setStoreId(nextId);
    setForm((current) => ({
      ...current,
      email: defaultEmail(nextStore?.name ?? ''),
      displayName: nextStore ? `Repartidor ${nextStore.name}` : '',
    }));
    setNotice(null);
  };

  const generateCreatePassword = () => {
    try {
      setCreatePassword(newPassword());
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No se pudo generar la clave.', 'danger');
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!storeId || !createPassword) {
      notificationService.notify('Selecciona una cuenta y genera una clave segura.', 'warning');
      return;
    }
    const password = createPassword;
    setBusy('create');
    setError(null);
    setNotice(null);
    try {
      const result = await developerRiderAccountService.create({ restaurantId: storeId, ...form, password });
      setNotice({ email: result.email, password, action: 'created' });
      setForm((current) => ({ ...emptyForm, email: current.email, displayName: current.displayName }));
      setCreatePassword('');
      notificationService.notify('Cuenta creada y vinculada al restaurante.', 'success');
      const updated = await restaurantRiderService.list(storeId);
      setRiders(updated.filter((rider) => rider.active));
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No se pudo crear la cuenta.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const reset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!storeId || !riderId || !resetPassword) {
      notificationService.notify('Selecciona un rider y genera una clave nueva.', 'warning');
      return;
    }
    const password = resetPassword;
    setBusy('reset');
    setError(null);
    setNotice(null);
    try {
      const result = await developerRiderAccountService.resetPassword({ restaurantId: storeId, riderId, password });
      setNotice({ email: result.email || selectedRider?.email || '', password, action: 'reset' });
      setResetPassword('');
      notificationService.notify('Clave actualizada. El próximo inicio de sesión usará la clave nueva.', 'success');
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No se pudo actualizar la clave.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const copyPassword = async () => {
    if (!notice) return;
    try {
      await navigator.clipboard.writeText(notice.password);
      notificationService.notify('Clave copiada al portapapeles.', 'success');
    } catch {
      notificationService.notify('Copia la clave seleccionando el texto.', 'warning');
    }
  };

  if (loading) return <Card role="status" className="p-8 text-center text-sm text-suya-muted">Cargando cuentas…</Card>;
  if (error) return <ErrorState title="No se pudo abrir el panel" description={error} onRetry={() => window.location.reload()} />;
  if (stores.length === 0) {
    return <EmptyState icon={<Users className="h-6 w-6" />} title="No hay cuentas activas" description="No hay restaurantes activos para asignar riders." />;
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-suya-green">Herramientas internas</p>
        <h1 className="font-display text-2xl font-bold">Panel de desarrolladores</h1>
        <p className="mt-1 max-w-2xl text-sm text-suya-muted">Crea cuentas rider verificadas, asígnalas a una tienda y restablece claves.</p>
      </header>

      <Card className="border-suya-green/20 bg-suya-green/5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-suya-green" aria-hidden="true" />
          <div>
            <p className="font-semibold">Acceso restringido</p>
            <p className="mt-1 text-sm text-suya-muted">La ruta y el servidor exigen rol `platform_admin`. Claves viajan por HTTPS y no se guardan en almacenamiento persistente.</p>
          </div>
          <Badge tone="lime">Solo plataforma</Badge>
        </div>
      </Card>

      {notice && (
        <Card className="border-suya-green/30">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{notice.action === 'created' ? 'Cuenta lista' : 'Clave restablecida'}</p>
              <p className="text-sm text-suya-muted">{notice.email}</p>
              <p className="mt-2 text-xs text-suya-muted">Guarda esta clave ahora. No se envía por correo y no aparecerá de nuevo.</p>
            </div>
            <Button variant="secondary" onClick={() => void copyPassword()}><KeyRound className="h-4 w-4" />Copiar clave</Button>
          </div>
          <p className="mt-3 select-all break-all rounded-btn bg-suya-mist px-3 py-2 font-mono text-sm" aria-label="Clave temporal">{notice.password}</p>
        </Card>
      )}

      <Card>
        <div className="flex items-start gap-3">
          <UserPlus className="mt-1 h-5 w-5 text-suya-green" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-bold">Crear cuenta rider</h2>
            <p className="text-sm text-suya-muted">Cuenta Auth confirmada al crear; el panel prepara perfil rider verificado y vínculo activo.</p>
          </div>
        </div>
        <form onSubmit={(event) => void create(event)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-semibold">Tienda
            <select value={storeId} onChange={(event) => changeStore(event.target.value)} className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-normal">
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Nombre visible
            <input required minLength={2} maxLength={120} value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal" />
          </label>
          <label className="text-sm font-semibold">Correo de inicio de sesión
            <input required type="email" autoComplete="off" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal" />
          </label>
          <label className="text-sm font-semibold">Teléfono
            <input value={form.phone} maxLength={20} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal" />
          </label>
          <label className="text-sm font-semibold">Vehículo
            <input value={form.vehicleType} maxLength={40} onChange={(event) => setForm((current) => ({ ...current, vehicleType: event.target.value }))} className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal" />
          </label>
          <label className="text-sm font-semibold">Color del vehículo
            <input value={form.vehicleColor} maxLength={40} onChange={(event) => setForm((current) => ({ ...current, vehicleColor: event.target.value }))} placeholder="Negro" className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal" />
          </label>
          <label className="text-sm font-semibold">Placa
            <input value={form.vehiclePlate} maxLength={20} onChange={(event) => setForm((current) => ({ ...current, vehiclePlate: event.target.value }))} placeholder="ABC-123" className="mt-1 h-11 w-full rounded-btn border border-suya-border px-3 font-normal" />
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={generateCreatePassword}><RefreshCw className="h-4 w-4" />Generar clave</Button>
              <input required minLength={12} maxLength={128} autoComplete="new-password" aria-label="Clave inicial" value={createPassword} onChange={(event) => setCreatePassword(event.target.value)} className="h-11 min-w-0 flex-1 rounded-btn border border-suya-border px-3 font-mono text-sm" placeholder="Clave inicial, mínimo 12 caracteres" />
            </div>
            <p className="text-xs text-suya-muted">El correo se usa como identificador. Si no tiene buzón, recuperación por email no estará disponible.</p>
            <Button type="submit" disabled={busy !== null || !createPassword}>{busy === 'create' ? 'Creando cuenta…' : 'Crear cuenta y asignar'}</Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <KeyRound className="mt-1 h-5 w-5 text-suya-green" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-bold">Restablecer clave</h2>
            <p className="text-sm text-suya-muted">Solo riders activos de la cuenta seleccionada.</p>
          </div>
        </div>
        <form onSubmit={(event) => void reset(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Tienda
            <select value={storeId} onChange={(event) => changeStore(event.target.value)} className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-normal">
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Repartidor
            <select required value={riderId} onChange={(event) => setRiderId(event.target.value)} disabled={ridersLoading || activeRiders.length === 0} className="mt-1 h-11 w-full rounded-btn border border-suya-border bg-white px-3 font-normal">
              {activeRiders.length === 0 ? <option value="">{ridersLoading ? 'Cargando…' : 'Sin riders activos'}</option> : activeRiders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name} · {rider.email}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={() => { try { setResetPassword(newPassword()); } catch (cause) { notificationService.notify(cause instanceof Error ? cause.message : 'No se pudo generar la clave.', 'danger'); } }}><RefreshCw className="h-4 w-4" />Generar clave</Button>
            <input required minLength={12} maxLength={128} autoComplete="new-password" aria-label="Clave nueva" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} className="h-11 min-w-0 flex-1 rounded-btn border border-suya-border px-3 font-mono text-sm" placeholder="Clave nueva, mínimo 12 caracteres" />
            <Button type="submit" variant="secondary" disabled={busy !== null || !riderId || !resetPassword}>{busy === 'reset' ? 'Actualizando…' : 'Restablecer clave'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
