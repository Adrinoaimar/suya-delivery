import { ShieldX } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { useAuthStore } from '@/store/authStore';

export default function UnauthorizedPage() {
  const signOut = useAuthStore((state) => state.signOut);
  return (
    <main id="contenido" className="grid min-h-dvh place-items-center bg-suya-cream px-4 text-center">
      <div className="max-w-md rounded-card bg-white p-7 shadow-card">
        <ShieldX className="mx-auto h-10 w-10 text-red-600" aria-hidden="true" />
        <h1 className="mt-4 font-display text-2xl font-bold">Acceso no autorizado</h1>
        <p className="mt-2 text-sm text-[#68716C]">
          Tu cuenta está autenticada, pero no tiene el rol necesario para esta aplicación.
        </p>
        <Button className="mt-5" onClick={() => void signOut()}>
          Cerrar sesión
        </Button>
      </div>
    </main>
  );
}
