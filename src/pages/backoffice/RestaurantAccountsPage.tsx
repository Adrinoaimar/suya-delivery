import { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, Clock3, Mail, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ErrorState } from '@/components/common/ErrorState';
import { Input, Textarea } from '@/components/common/Input';
import { notificationService, restaurantAccountService } from '@/lib/services';
import type { RestaurantAccount, RestaurantAccountStatus } from '@/lib/services/types';

const statusCopy: Record<RestaurantAccountStatus, { label: string; className: string }> = {
  pending_contact: { label: 'Falta contacto', className: 'bg-amber-100 text-amber-800' },
  ready_to_invite: { label: 'Lista para invitar', className: 'bg-suya-lime-soft text-suya-green-dark' },
  invited: { label: 'Invitación enviada', className: 'bg-sky-100 text-sky-800' },
  active: { label: 'Activa', className: 'bg-emerald-100 text-emerald-800' },
  suspended: { label: 'Suspendida', className: 'bg-red-100 text-red-800' },
};

function dateLabel(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-PE');
}

export default function RestaurantAccountsPage() {
  const [accounts, setAccounts] = useState<RestaurantAccount[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Pick<RestaurantAccount, 'contactName' | 'contactEmail' | 'notes'>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await restaurantAccountService.list();
      setAccounts(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.restaurantId, {
        contactName: row.contactName,
        contactEmail: row.contactEmail,
        notes: row.notes,
      }])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las cuentas de restaurantes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateDraft = (restaurantId: string, key: keyof Pick<RestaurantAccount, 'contactName' | 'contactEmail' | 'notes'>, value: string) => {
    setDrafts((current) => ({ ...current, [restaurantId]: { ...current[restaurantId], [key]: value } }));
  };

  async function save(row: RestaurantAccount) {
    const draft = drafts[row.restaurantId];
    if (!draft) return;
    setSaving(row.restaurantId);
    try {
      const saved = await restaurantAccountService.saveContact({ restaurantId: row.restaurantId, ...draft });
      setAccounts((current) => current.map((account) => account.restaurantId === saved.restaurantId ? saved : account));
      notificationService.notify(saved.status === 'ready_to_invite' ? 'Contacto guardado. Cuenta lista para invitación segura.' : 'Datos de contacto guardados.', 'success');
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No se pudieron guardar los datos.', 'danger');
    } finally {
      setSaving(null);
    }
  }

  async function invite(row: RestaurantAccount) {
    setInviting(row.restaurantId);
    try {
      const updated = await restaurantAccountService.invite(row.restaurantId);
      setAccounts((current) => current.map((account) => account.restaurantId === updated.restaurantId ? updated : account));
      notificationService.notify('Invitación enviada. El propietario debe aceptar el correo.', 'success');
    } catch (cause) {
      notificationService.notify(cause instanceof Error ? cause.message : 'No se pudo enviar la invitación.', 'danger');
    } finally {
      setInviting(null);
    }
  }

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-suya-green">Acceso seguro</p>
        <h1 className="font-display text-2xl font-bold">Cuentas de restaurantes</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#68716C]">Un casillero por negocio. Registra representante y correo; la invitación real se envía después mediante una función segura, nunca desde el APK.</p>
      </div>
      <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" />Actualizar</Button>
    </div>

    <Card className="flex items-start gap-3 border-suya-lime/40 bg-suya-lime-soft/60">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-suya-green" aria-hidden="true" />
      <div className="text-sm"><p className="font-semibold text-suya-green-dark">No se inventan credenciales</p><p className="mt-1 text-suya-green-dark/80">La pantalla solo prepara datos de contacto. No almacena contraseñas, tokens ni claves de servicio.</p></div>
    </Card>

    {loading && <Card className="p-8 text-center text-sm text-[#68716C]">Cargando cuentas reales…</Card>}
    {!loading && accounts.length === 0 && <Card className="p-8 text-center text-sm text-[#68716C]">No hay registros de restaurantes todavía.</Card>}
    <div className="grid gap-5 xl:grid-cols-2">
      {accounts.map((row) => {
        const draft = drafts[row.restaurantId] ?? { contactName: '', contactEmail: '', notes: '' };
        const status = statusCopy[row.status];
        const immutable = row.status === 'invited' || row.status === 'active' || row.status === 'suspended';
        return <Card key={row.restaurantId} className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-suya-ivory text-suya-green"><Building2 className="h-5 w-5" aria-hidden="true" /></div><div className="min-w-0"><h2 className="truncate font-display text-lg font-bold">{row.restaurantName}</h2><p className="truncate text-xs text-[#68716C]">ID {row.restaurantId}</p></div></div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Representante" value={draft.contactName} onChange={(event) => updateDraft(row.restaurantId, 'contactName', event.target.value)} placeholder="Nombre y apellido" maxLength={120} disabled={immutable} />
            <Input label="Correo de acceso" type="email" value={draft.contactEmail} onChange={(event) => updateDraft(row.restaurantId, 'contactEmail', event.target.value)} placeholder="responsable@negocio.pe" maxLength={254} disabled={immutable} />
          </div>
          <Textarea label="Notas internas" value={draft.notes} onChange={(event) => updateDraft(row.restaurantId, 'notes', event.target.value)} placeholder="Autorización comercial, sede, observaciones…" maxLength={500} disabled={immutable} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-suya-mist pt-3 text-xs text-[#68716C]">
            <div className="flex flex-wrap gap-x-4 gap-y-1"><span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{row.contactEmail || 'Sin correo'}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Actualizada {dateLabel(row.updatedAt)}</span>{row.activatedAt && <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-suya-green" aria-hidden="true" />Activa desde {dateLabel(row.activatedAt)}</span>}</div>
            {!immutable && <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void save(row)} disabled={saving === row.restaurantId || inviting === row.restaurantId}><Save className="h-4 w-4" />{saving === row.restaurantId ? 'Guardando…' : 'Guardar contacto'}</Button>{row.status === 'ready_to_invite' && <Button onClick={() => void invite(row)} disabled={saving === row.restaurantId || inviting === row.restaurantId}><Mail className="h-4 w-4" />{inviting === row.restaurantId ? 'Enviando…' : 'Enviar invitación'}</Button>}</div>}
          </div>
        </Card>;
      })}
    </div>
  </div>;
}
