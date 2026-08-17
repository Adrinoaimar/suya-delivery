import { ButtonLink } from '@/components/common/Button';
import { LogoMark } from '@/components/common/Logo';

export default function NotFoundPage() {
  return (
    <div className="shell flex min-h-[60dvh] flex-col items-center justify-center gap-4 py-12 text-center">
      <LogoMark className="h-16 w-16" />
      <div>
        <h1 className="font-display text-2xl font-bold">No encontramos esta página</h1>
        <p className="mt-1 text-sm text-[#6B7076]">
          El enlace puede estar mal escrito o la sección ya no existe.
        </p>
      </div>
      <div className="flex gap-2">
        <ButtonLink to="/">Ir al inicio</ButtonLink>
        <ButtonLink to="/stores" variant="secondary">
          Ver tiendas
        </ButtonLink>
      </div>
    </div>
  );
}
