import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
}

export function RiderCancelDialog({ open, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setReason(''); setError(null); setSaving(false); } }, [open]);
  async function submit() {
    const value = reason.trim();
    if (value.length < 3) { setError('Indica un motivo breve.'); return; }
    setSaving(true);
    try {
      if (!await onSubmit(value)) { setError('El pedido cambió de estado o ya no está asignado.'); setSaving(false); return; }
      onClose();
    } catch { setError('No pudimos cancelar la asignación. Inténtalo nuevamente.'); setSaving(false); }
  }
  return <Modal open={open} onClose={onClose} title="Cancelar asignación" description="Solo puedes cancelar antes de recoger el pedido." size="sm" footer={<div className="flex gap-2"><Button variant="ghost" fullWidth onClick={onClose}>Volver</Button><Button variant="danger" fullWidth disabled={saving || reason.trim().length < 3} onClick={() => void submit()}>{saving ? 'Cancelando…' : 'Cancelar pedido'}</Button></div>}>
    <div className="space-y-3"><div className="flex gap-2 rounded-btn bg-suya-danger-soft p-3 text-sm text-suya-danger"><AlertTriangle className="h-4 w-4 shrink-0" />La empresa podrá reasignar este pedido a otro repartidor.</div><label htmlFor="rider-cancel-reason" className="text-sm font-medium">Motivo</label><textarea id="rider-cancel-reason" value={reason} maxLength={300} rows={3} onChange={(event) => { setReason(event.target.value); setError(null); }} className="w-full rounded-btn border border-suya-mist p-3 text-sm outline-none focus:border-suya-green" placeholder="Ej. vehículo averiado" />{error && <p role="alert" className="text-sm font-medium text-suya-danger">{error}</p>}</div>
  </Modal>;
}
