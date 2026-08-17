import { useState } from 'react';
import { Trash2, UserRoundCheck } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Input, Select } from '@/components/common/Input';
import { notificationService } from '@/lib/services';
import { useRiderStore } from '@/store/riderStore';

const RELATIONS = [
  { value: 'Familiar', label: 'Familiar' },
  { value: 'Pareja', label: 'Pareja' },
  { value: 'Amistad', label: 'Amistad' },
  { value: 'Compañero de trabajo', label: 'Compañero de trabajo' },
];

export function TrustedContactForm() {
  const contact = useRiderStore((state) => state.trustedContact);
  const setTrustedContact = useRiderStore((state) => state.setTrustedContact);

  const [form, setForm] = useState({
    name: contact?.name ?? '',
    phone: contact?.phone ?? '',
    relation: contact?.relation ?? 'Familiar',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function save() {
    const next: Record<string, string> = {};
    if (form.name.trim().length < 3) next.name = 'Escribe el nombre de tu contacto.';
    if (!/^[0-9+\s]{6,15}$/.test(form.phone.trim())) next.phone = 'Escribe un teléfono válido.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setTrustedContact({
      name: form.name.trim(),
      phone: form.phone.trim(),
      relation: form.relation,
    });
    notificationService.notify('Contacto de confianza guardado', 'success');
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-suya-lime-soft text-suya-green">
          <UserRoundCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">Contacto de confianza</h2>
          <p className="mt-0.5 text-sm text-[#6B7076]">
            Solo se guarda en este dispositivo. Nadie más puede verlo.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="Nombre"
          value={form.name}
          error={errors.name}
          placeholder="María López"
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <Input
          label="Teléfono"
          type="tel"
          inputMode="tel"
          value={form.phone}
          error={errors.phone}
          placeholder="987 654 321"
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
        />
        <Select
          label="Relación"
          value={form.relation}
          options={RELATIONS}
          onChange={(event) => setForm({ ...form, relation: event.target.value })}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save}>Guardar contacto</Button>
        {contact && (
          <Button
            variant="ghost"
            onClick={() => {
              setTrustedContact(null);
              setForm({ name: '', phone: '', relation: 'Familiar' });
              notificationService.notify('Contacto eliminado', 'info');
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Quitar
          </Button>
        )}
      </div>

      {contact && (
        <p className="rounded-btn bg-suya-mist/50 px-3 py-2.5 text-sm text-[#4A4F55]">
          Contacto activo: <strong>{contact.name}</strong> · {contact.phone} · {contact.relation}
        </p>
      )}
    </Card>
  );
}
