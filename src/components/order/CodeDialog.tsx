import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { CODE_ERROR_MESSAGES } from '@/lib/services';
import type { CodeResult } from '@/lib/services';
import type { Order } from '@/types';

interface CodeDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  helper?: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  onSubmit: (code: string) => CodeResult;
  onSuccess?: (order: Order) => void;
}

/** Pide un código de 4 dígitos antes de cerrar o cancelar un pedido. */
export function CodeDialog({
  open,
  onClose,
  title,
  description,
  helper,
  confirmLabel,
  tone = 'primary',
  onSubmit,
  onSuccess,
}: CodeDialogProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setError(null);
    }
  }, [open]);

  function submit() {
    if (code.length !== 4) {
      setError('Escribe los 4 dígitos del código.');
      return;
    }
    const result = onSubmit(code);
    if (!result.ok) {
      setError(CODE_ERROR_MESSAGES[result.reason]);
      return;
    }
    onSuccess?.(result.order);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      initialFocusSelector="#codigo-pedido"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" fullWidth onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            fullWidth
            onClick={submit}
            disabled={code.length !== 4}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <label htmlFor="codigo-pedido" className="flex items-center gap-2 text-sm font-medium">
          <KeyRound aria-hidden="true" className="h-4 w-4 text-suya-green" />
          Código de 4 dígitos
        </label>
        <input
          id="codigo-pedido"
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={4}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'codigo-pedido-error' : undefined}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, '').slice(0, 4));
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          className="h-16 w-full rounded-btn border border-suya-mist bg-white text-center font-display text-3xl font-bold tracking-[0.6em] text-suya-carbon focus:border-suya-green focus:outline-none focus:ring-2 focus:ring-suya-lime/50"
          placeholder="0000"
        />
        {error ? (
          <p id="codigo-pedido-error" role="alert" className="text-sm font-medium text-suya-danger">
            {error}
          </p>
        ) : helper ? (
          <p className="text-sm text-[#6B7076]">{helper}</p>
        ) : null}
      </div>
    </Modal>
  );
}
