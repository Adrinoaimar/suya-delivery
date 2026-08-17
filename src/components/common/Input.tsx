import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const FIELD =
  'w-full rounded-btn border border-suya-mist bg-white px-3.5 text-[15px] text-suya-carbon ' +
  'placeholder:text-[#9AA0A6] transition-colors ' +
  'focus:border-suya-green focus:outline-none focus:ring-2 focus:ring-suya-lime/50';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Id del mensaje asociado al campo, para enlazarlo con `aria-describedby`. */
function describedById(id: string): string {
  return `${id}-desc`;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-suya-carbon">
        {label}
      </label>
      {children}
      {error ? (
        <p id={describedById(id)} className="text-xs font-medium text-suya-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={describedById(id)} className="text-xs text-[#6B7076]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, className, id, ...rest }: InputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error}>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? describedById(fieldId) : undefined}
        className={cn(FIELD, 'h-12', error && 'border-suya-danger', className)}
        {...rest}
      />
    </FieldShell>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Textarea({ label, hint, error, className, id, rows = 3, ...rest }: TextareaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error}>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? describedById(fieldId) : undefined}
        className={cn(FIELD, 'resize-y py-3', error && 'border-suya-danger', className)}
        {...rest}
      />
    </FieldShell>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, hint, error, options, className, id, ...rest }: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error}>
      <select
        id={fieldId}
        aria-describedby={error || hint ? describedById(fieldId) : undefined}
        className={cn(FIELD, 'h-12 appearance-none', className)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
