import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import type { AccessRole } from '@/lib/auth/types';
import { useAuthStore } from '@/store/authStore';

interface LoginPageProps {
  title: string;
  allowed: AccessRole[];
  allowCustomerSignup?: boolean;
  defaultPath: string;
}

export default function LoginPage({ title, allowed, allowCustomerSignup = false, defaultPath }: LoginPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const identity = useAuthStore((state) => state.identity);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const signIn = useAuthStore((state) => state.signIn);
  const signUpCustomer = useAuthStore((state) => state.signUpCustomer);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (identity && allowed.some((role) => identity.access.includes(role))) {
    return <Navigate to={defaultPath} replace />;
  }

  const from = (location.state as { from?: string } | null)?.from ?? defaultPath;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      if (mode === 'signup') {
        const confirmation = await signUpCustomer({ email, password, displayName });
        setMessage(confirmation ? 'Revisa tu correo para confirmar la cuenta.' : 'Cuenta creada.');
        if (!confirmation) navigate(from, { replace: true });
      } else {
        await signIn({ email, password });
        const current = useAuthStore.getState().identity;
        navigate(current && allowed.some((role) => current.access.includes(role)) ? from : '/unauthorized', { replace: true });
      }
    } catch {
      // El store expone un mensaje seguro y visible.
    }
  }

  return (
    <main id="contenido" className="grid min-h-dvh place-items-center bg-suya-cream px-4 py-8">
      <section className="w-full max-w-md rounded-card bg-white p-6 shadow-card sm:p-8">
        <LockKeyhole className="h-8 w-8 text-suya-green" aria-hidden="true" />
        <h1 className="mt-4 font-display text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-[#68716C]">Sesión protegida por Supabase Auth y permisos RLS.</p>

        {!isSupabaseConfigured && (
          <div className="mt-4 flex gap-2 rounded-btn bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Backend no configurado. Esta aplicación no debe publicarse todavía.
          </div>
        )}

        <form className="mt-5 space-y-4" onSubmit={submit}>
          {mode === 'signup' && (
            <Input label="Nombre" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} />
          )}
          <Input label="Correo" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Input label="Contraseña" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
          {(error || message) && <p role="status" className="text-sm text-[#68716C]">{message ?? error}</p>}
          <Button type="submit" fullWidth disabled={!isSupabaseConfigured || status === 'loading'}>
            {mode === 'signup' ? 'Crear cuenta' : 'Ingresar'}
          </Button>
        </form>

        {allowCustomerSignup && (
          <button type="button" className="mt-4 w-full text-sm font-semibold text-suya-green" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Crear cuenta de cliente' : 'Ya tengo cuenta'}
          </button>
        )}
      </section>
    </main>
  );
}
