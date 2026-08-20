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
    question: '¿Cómo pago?',
    answer:
      'Por ahora solo aceptamos efectivo al recibir. Los pagos digitales seguirán deshabilitados hasta integrar confirmación segura del proveedor.',
  },
  {
    question: '¿Puedo seguir mi pedido?',
    answer:
      'Sí. En «Pedidos» abre el pedido en curso. Verás estados reales y GPS del repartidor cuando recoja el pedido.',
  },
  {
    question: '¿Cómo protegemos mi ubicación?',
    answer:
      'El punto exacto se solicita solo al confirmar. No enviamos tu dirección a geocodificadores públicos; Supabase aplica permisos por participante.',
  },
  {
    question: '¿Puedo compartir un enlace público?',
    answer:
      'Todavía no. Esta opción está deshabilitada hasta contar con tokens criptográficos, vencimiento y revocación server-side.',
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
          Soporte humano y teléfono operativo todavía no están habilitados. Para un pedido activo,
          revisa su detalle y estado. En una emergencia real usa los números oficiales 105 o 116.
        </p>
      </Card>
    </div>
  );
}
