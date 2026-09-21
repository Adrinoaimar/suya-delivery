import { useEffect } from 'react';
import { SeoHead } from '@/components/common/SeoHead';
import { JOBS_SITE_URL, redirectToJobs } from '@/lib/jobsLink';

const defaultRedirect = () => redirectToJobs();

interface JobsRedirectPageProps {
  redirect?: () => void;
}

/** Public bridge under the root domain; it keeps the Jobs destination easy to share. */
export default function JobsRedirectPage({ redirect = defaultRedirect }: JobsRedirectPageProps) {
  useEffect(() => {
    redirect();
  }, [redirect]);

  return (
    <>
      <SeoHead
        title="Suya Jobs | Suya Delivery"
        description="Redirección a las oportunidades de trabajo de Suya."
        path="/jobs"
        noIndex
      />
      <main className="min-h-dvh bg-[#faf7f1] px-5 py-16 text-center text-[#1f2923]">
        <div className="mx-auto flex max-w-md flex-col items-center rounded-[2rem] bg-white px-6 py-10 shadow-[0_20px_60px_rgba(31,41,35,0.12)]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0e6b44]">Suya Jobs</p>
          <h1 className="mt-3 text-2xl font-semibold">
            Te estamos llevando a las oportunidades de Suya
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#626963]">
            Si no se abre automáticamente, usa el botón para continuar.
          </p>
          <a
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-[#0e6b44] px-6 text-sm font-semibold text-white transition hover:bg-[#0a5335] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e6b44]"
            href={JOBS_SITE_URL}
          >
            Abrir Suya Jobs
          </a>
        </div>
      </main>
    </>
  );
}
