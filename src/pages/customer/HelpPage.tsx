import { useState } from 'react';
import { ChevronDown, LifeBuoy, MessageSquare, ShieldCheck } from 'lucide-react';
import { ButtonLink, ExternalButtonLink } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { cn } from '@/lib/cn';

const FAQ = [
  {
    question: '¿Cómo hago un pedido?',
    answer:
      'Elige un negocio, agrega productos al carrito y confirma en el checkout. Verás el seguimiento apenas se cree el pedido.',
  },
  {
    question: '¿Los pagos son reales?',
    answer:
      'No. Esta versión es una demostración local: efectivo, Yape y tarjeta se simulan en el navegador y nunca se envía información a una pasarela.',
  },
  {
    question: '¿Puedo seguir mi pedido?',
    answer:
      'Sí. En «Pedidos» abre el pedido en curso: verás el mapa, el estado y el avance del repartidor con tiempos simulados.',
  },
  {
    question: '¿Qué es el modo demo local?',
    answer:
      'Todos los datos (carrito, pedidos, favoritos, seguridad) se guardan solo en este navegador con localStorage. No hay base de datos ni servidor.',
  },
  {
    question: '¿Cómo funciona compartir ubicación?',
    answer:
      'En la demo la ubicación se comparte entre pestañas del mismo navegador. En producción hará falta un servicio en tiempo real para enlazar dos dispositivos distintos.',
  },
  {
    question: '¿Puedo instalarla como aplicación?',
    answer:
      'Sí. Desde el navegador del celular usa «Agregar a pantalla de inicio»: Suya Delivery se abre en modo aplicación conservando la web.',
  },
];

export default function HelpPage() {
  const riderAppUrl = import.meta.env.VITE_RIDER_APP_URL;
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="shell max-w-3xl space-y-4 py-4 lg:py-8">
      <h1 className="section-title">Centro de ayuda</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <MessageSquare className="h-5 w-5 text-suya-green" aria-hidden="true" />
          <h2 className="mt-2 font-display text-[15px] font-bold">¿Problemas con un pedido?</h2>
          <p className="mt-1 text-sm text-[#6B7076]">
            Abre el detalle del pedido para revisar el estado, el repartidor y la dirección.
          </p>
          <ButtonLink to="/orders" variant="secondary" size="sm" className="mt-3">
            Ver mis pedidos
          </ButtonLink>
        </Card>
        <Card>
          <ShieldCheck className="h-5 w-5 text-suya-green" aria-hidden="true" />
          <h2 className="mt-2 font-display text-[15px] font-bold">Seguridad en ruta</h2>
          <p className="mt-1 text-sm text-[#6B7076]">
            Herramientas para repartidores: ubicación compartida, contacto de confianza y SOS.
          </p>
          {riderAppUrl && (
            <ExternalButtonLink
              href={`${riderAppUrl.replace(/\/$/, '')}/rider/safety`}
              variant="secondary"
              size="sm"
              className="mt-3"
            >
              Abrir seguridad
            </ExternalButtonLink>
          )}
        </Card>
      </div>

      <section>
        <h2 className="section-title mb-3">Preguntas frecuentes</h2>
        <ul className="space-y-2">
          {FAQ.map((item, index) => {
            const expanded = open === index;
            return (
              <li key={item.question} className="overflow-hidden rounded-card border border-suya-mist bg-white">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : index)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="font-display text-[15px] font-semibold">{item.question}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'h-5 w-5 shrink-0 text-[#6B7076] transition-transform',
                      expanded && 'rotate-180',
                    )}
                  />
                </button>
                {expanded && (
                  <p className="border-t border-suya-mist px-4 py-3 text-sm text-[#4A4F55]">
                    {item.answer}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Card className="flex items-start gap-3">
        <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-suya-green" aria-hidden="true" />
        <p className="text-sm text-[#4A4F55]">
          Esta es una demostración para validar la experiencia antes de conectar un backend real. No
          existe atención al cliente ni números de contacto operativos.
        </p>
      </Card>
    </div>
  );
}
