import { Apple, ArrowLeft, Download, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SeoHead } from '@/components/common/SeoHead';

function getAndroidApkUrl(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate, window.location.origin);
    const isSameOrigin = url.origin === window.location.origin;
    if ((!isSameOrigin && url.protocol !== 'https:') || !url.pathname.toLowerCase().endsWith('.apk')) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export default function DownloadAppPage() {
  const androidApkUrl = getAndroidApkUrl(import.meta.env.VITE_ANDROID_APK_URL);

  return (
    <>
      <SeoHead
        title="Descargar Suya Delivery | Android y iOS"
        description="Consulta las opciones para descargar Suya Delivery en Android y conoce cuándo estará disponible en iOS."
        path="/descargar"
      />
      <div className="shell py-8 lg:py-12">
        <div className="mx-auto max-w-4xl">
          <Link
            to="/"
            className="inline-flex min-h-12 items-center gap-2 rounded-btn px-2 text-sm font-semibold text-suya-green hover:bg-white"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Volver al inicio
          </Link>

          <section className="mt-4 rounded-promo border border-suya-border bg-white px-5 py-8 shadow-soft sm:px-8 sm:py-10">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-suya-green">
              Suya en tu celular
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
              Descargar aplicación
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-suya-muted sm:text-base">
              Pide en los negocios locales de Sullana desde la aplicación de Suya Delivery.
              Elige tu plataforma para ver su disponibilidad.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              <article className="flex min-h-60 flex-col rounded-card border border-suya-border bg-suya-ivory p-5 sm:p-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-suya-green text-white">
                  <Smartphone aria-hidden="true" className="h-6 w-6" />
                </span>
                <h2 className="mt-4 font-display text-xl font-bold">Android</h2>
                <p className="mt-2 flex-1 text-sm leading-6 text-suya-muted">
                  {androidApkUrl
                    ? 'Descarga la APK más reciente de Suya Delivery.'
                    : 'Estamos preparando la APK actualizada para descarga.'}
                </p>
                {androidApkUrl ? (
                  <a
                    href={androidApkUrl}
                    download
                    className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-btn bg-suya-green px-4 text-sm font-semibold text-white hover:bg-suya-green-dark"
                  >
                    <Download aria-hidden="true" className="h-4 w-4" />
                    Descargar APK
                  </a>
                ) : (
                  <span className="mt-5 inline-flex min-h-12 items-center justify-center rounded-btn border border-suya-border bg-white px-4 text-sm font-semibold text-suya-muted">
                    Descarga en preparación
                  </span>
                )}
              </article>

              <article className="flex min-h-60 flex-col rounded-card border border-suya-border bg-white p-5 sm:p-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-suya-mist text-suya-carbon">
                  <Apple aria-hidden="true" className="h-6 w-6" />
                </span>
                <h2 className="mt-4 font-display text-xl font-bold">iOS</h2>
                <p className="mt-2 flex-1 text-sm leading-6 text-suya-muted">
                  La aplicación para iPhone estará disponible próximamente.
                </p>
                <span className="mt-5 inline-flex min-h-12 items-center justify-center rounded-btn border border-suya-border bg-suya-ivory px-4 text-sm font-semibold text-suya-muted">
                  Próximamente
                </span>
              </article>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
