import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { isGoogleAuthEnabled, isSupabaseConfigured } from '@/lib/supabase/client';
import { safeReturnPath } from '@/lib/auth/oauth';
import type { AccessRole } from '@/lib/auth/types';
import { useAuthStore } from '@/store/authStore';

interface LoginPageProps {
  title: string;
  allowed: AccessRole[];
  allowCustomerSignup?: boolean;
  defaultPath: string;
}

interface FieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
  passwordConfirmation?: string;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.3H3.1a10 10 0 0 0 0 9.4L6.5 14Z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.8A9.8 9.8 0 0 0 3.1 7.3l3.4 2.8A5.9 5.9 0 0 1 12 6Z" />
    </svg>
  );
}

export default function LoginPage({ title, allowed, allowCustomerSignup = false, defaultPath }: LoginPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const identity = useAuthStore((state) => state.identity);
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
  const signIn = useAuthStore((state) => state.signIn);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const signUpCustomer = useAuthStore((state) => state.signUpCustomer);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!allowCustomerSignup || !isSupabaseConfigured) {
      setGoogleAvailable(false);
      return;
    }
    let active = true;
    void isGoogleAuthEnabled().then((enabled) => {
      if (active) setGoogleAvailable(enabled);
    });
    return () => {
      active = false;
    };
  }, [allowCustomerSignup]);

  const stateFrom = (location.state as { from?: string } | null)?.from;
  const queryFrom = new URLSearchParams(location.search).get('next');
  const from = safeReturnPath(queryFrom ?? stateFrom, defaultPath);

  if (identity) {
    return <Navigate to={allowed.some((role) => identity.access.includes(role)) ? from : '/unauthorized'} replace />;
  }

  function validate(): boolean {
    const nextErrors: FieldErrors = {};
    if (!email.trim()) nextErrors.email = 'Ingresa tu correo.';
    if (!password) nextErrors.password = 'Ingresa tu contraseña.';
    if (mode === 'signup') {
      if (displayName.trim().length < 2) nextErrors.displayName = 'Escribe al menos 2 caracteres.';
      if (password.length < 8) nextErrors.password = 'Usa al menos 8 caracteres.';
      if (passwordConfirmation !== password) nextErrors.passwordConfirmation = 'Las contraseñas no coinciden.';
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!validate()) return;
    try {
      if (mode === 'signup') {
        const confirmation = await signUpCustomer({ email: email.trim(), password, displayName: displayName.trim() });
        setMessage(confirmation ? 'Revisa tu correo para confirmar la cuenta.' : 'Cuenta creada.');
        if (!confirmation) navigate(from, { replace: true });
        else {
          setMode('login');
          setPassword('');
          setPasswordConfirmation('');
        }
      } else {
        await signIn({ email: email.trim(), password });
        const current = useAuthStore.getState().identity;
        navigate(current && allowed.some((role) => current.access.includes(role)) ? from : '/unauthorized', { replace: true });
      }
    } catch {
      // El store expone un mensaje seguro y visible.
    }
  }

  async function continueWithGoogle() {
    setMessage(null);
    setFieldErrors({});
    try {
      await signInWithGoogle(from);
    } catch {
      // El store expone un mensaje seguro y visible.
    }
  }

  function changeMode(nextMode: 'login' | 'signup') {
    if (nextMode === mode) return;
    setMode(nextMode);
    setPassword('');
    setPasswordConfirmation('');
    setMessage(null);
    setFieldErrors({});
  }

  const busy = status === 'loading';
  const actionLabel = mode === 'signup' ? 'Crear mi cuenta' : 'Ingresar';

  return (
    <main id="contenido" className="relative grid min-h-dvh place-items-center overflow-hidden bg-suya-cream px-4 py-8">
      <div className="pointer-events-none absolute -left-24 top-12 h-64 w-64 rounded-full bg-suya-green/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 bottom-8 h-72 w-72 rounded-full bg-suya-yellow/20 blur-3xl" aria-hidden="true" />
      <section className="relative w-full max-w-md animate-slide-up overflow-hidden rounded-card border border-white/80 bg-white/90 p-6 shadow-card backdrop-blur-xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-suya-green text-white shadow-lg shadow-suya-green/20">
            <LockKeyhole className="h-6 w-6" aria-hidden="true" />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-suya-green/10 px-3 py-1.5 text-xs font-bold text-suya-green">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Acceso seguro
          </span>
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-suya-carbon">{title}</h1>
        <p className="mt-1.5 text-sm leading-6 text-suya-muted">
          {allowCustomerSignup ? 'Pide, guarda tus direcciones y descubre ofertas exclusivas.' : 'Ingresa con la cuenta asignada a tu operación.'}
        </p>

        {!isSupabaseConfigured && (
          <div role="alert" className="mt-4 flex gap-2 rounded-btn bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Backend no configurado. Esta aplicación no debe publicarse todavía.
          </div>
        )}

        {allowCustomerSignup && (
          <>
            <div className="mt-6 grid grid-cols-2 rounded-xl bg-suya-carbon/[0.04] p-1" aria-label="Tipo de acceso">
              {(['login', 'signup'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mode === option}
                  onClick={() => changeMode(option)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-bold transition-all duration-200 ${
                    mode === option ? 'bg-white text-suya-carbon shadow-sm' : 'text-suya-muted hover:text-suya-carbon'
                  }`}
                >
                  {option === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void continueWithGoogle()}
              disabled={!isSupabaseConfigured || googleAvailable !== true || busy}
              aria-busy={busy}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-3 rounded-btn border border-suya-border bg-white px-4 text-sm font-bold text-suya-carbon shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-suya-green/30 hover:shadow-md active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy || googleAvailable === null ? (
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <GoogleMark />
              )}
              {googleAvailable === false ? 'Google pendiente de activación' : 'Continuar con Google'}
            </button>

            {googleAvailable === false && (
              <p role="status" className="mt-2 text-center text-xs text-suya-muted">
                El proveedor se habilitará cuando termine su configuración segura.
              </p>
            )}

            <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-suya-muted/80" aria-hidden="true">
              <span className="h-px flex-1 bg-suya-border" />
              o con correo
              <span className="h-px flex-1 bg-suya-border" />
            </div>
          </>
        )}

        <form
          key={mode}
          className={`${allowCustomerSignup ? '' : 'mt-6'} motion-fade space-y-4`}
          onSubmit={submit}
          aria-busy={busy}
          noValidate
        >
          {mode === 'signup' && (
            <Input
              label="Nombre completo"
              name="name"
              autoComplete="name"
              value={displayName}
              error={fieldErrors.displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              minLength={2}
            />
          )}
          <Input
            label="Correo"
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            label="Contraseña"
            name="password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            error={fieldErrors.password}
            hint={mode === 'signup' ? 'Mínimo 8 caracteres.' : undefined}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
          {mode === 'signup' && (
            <Input
              label="Confirmar contraseña"
              name="password-confirmation"
              type="password"
              autoComplete="new-password"
              value={passwordConfirmation}
              error={fieldErrors.passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
              minLength={8}
            />
          )}
          {(error || message) && (
            <p role={error ? 'alert' : 'status'} aria-live="polite" className={`rounded-btn p-3 text-sm ${error ? 'bg-red-50 text-suya-danger' : 'bg-suya-green/10 text-suya-green'}`}>
              {message ?? error}
            </p>
          )}
          <Button type="submit" fullWidth disabled={!isSupabaseConfigured || busy} aria-busy={busy} className="group min-h-12">
            {busy ? (
              <>
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                Procesando
              </>
            ) : (
              <>
                {actionLabel}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </>
            )}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs leading-5 text-suya-muted">
          Tus datos se protegen con autenticación cifrada y permisos por rol.
        </p>
      </section>
    </main>
  );
}
