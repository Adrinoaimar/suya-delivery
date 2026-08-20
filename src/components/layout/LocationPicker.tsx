import { Check, MapPin } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { LOCATION_OPTIONS, useUserStore } from '@/store/userStore';
import { cn } from '@/lib/cn';

interface LocationPickerProps {
  open: boolean;
  onClose: () => void;
}

/** Referencia general; punto exacto se confirma por GPS en checkout. */
export function LocationPicker({ open, onClose }: LocationPickerProps) {
  const locationLabel = useUserStore((state) => state.preferences.locationLabel);
  const setPreferences = useUserStore((state) => state.setPreferences);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="¿Dónde entregamos?"
      description="Elige una referencia general dentro de Sullana."
    >
      <ul className="space-y-2">
        {LOCATION_OPTIONS.map((option) => {
          const active = option === locationLabel;
          return (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  setPreferences({ locationLabel: option });
                  onClose();
                }}
                className={cn(
                  'press flex w-full items-center gap-3 rounded-btn border px-3.5 py-3 text-left transition-colors',
                  active
                    ? 'border-suya-green bg-suya-lime-soft'
                    : 'border-suya-mist hover:border-suya-lime',
                )}
              >
                <MapPin
                  aria-hidden="true"
                  className={cn('h-5 w-5 shrink-0', active ? 'text-suya-green' : 'text-[#6B7076]')}
                />
                <span className="flex-1 text-[15px]">{option}</span>
                {active && <Check aria-hidden="true" className="h-5 w-5 text-suya-green" />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-[#6B7076]">
        Confirmarás el punto exacto con GPS antes de crear el pedido.
      </p>
    </Modal>
  );
}
