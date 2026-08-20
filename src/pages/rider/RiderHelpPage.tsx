import { CircleHelp, PhoneCall, ShieldAlert } from 'lucide-react';

export default function RiderHelpPage() {
  return (
    <section id="contenido" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <CircleHelp aria-hidden="true" className="h-7 w-7 text-suya-lime" />
        <div>
          <h1 className="font-display text-2xl font-bold">Ayuda al repartidor</h1>
          <p className="text-sm text-white/65">Soporte operativo y actuación segura.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-card border border-white/10 bg-white/5 p-5">
          <PhoneCall aria-hidden="true" className="mb-3 h-5 w-5 text-suya-lime" />
          <h2 className="font-display font-bold">Problema con un pedido</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            Reporta el incidente desde el viaje activo para conservar pedido, ubicación y hora.
          </p>
        </article>
        <article className="rounded-card border border-white/10 bg-white/5 p-5">
          <ShieldAlert aria-hidden="true" className="mb-3 h-5 w-5 text-suya-lime" />
          <h2 className="font-display font-bold">Emergencia</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            Usa Seguridad para activar el protocolo y contacta primero a los servicios locales.
          </p>
        </article>
      </div>
    </section>
  );
}
