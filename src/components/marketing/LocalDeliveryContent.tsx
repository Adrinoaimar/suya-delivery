import { Link } from 'react-router-dom';

const steps = [
  {
    title: 'Explora negocios de Sullana',
    body: 'Revisa restaurantes, tiendas y comercios incorporados a Suya. Cada ficha muestra su catálogo disponible antes de empezar el pedido.',
  },
  {
    title: 'Elige y confirma tu pedido',
    body: 'Agrega productos al carrito, verifica el total y completa la dirección de entrega. Las opciones de pago aparecen según la configuración de cada negocio.',
  },
  {
    title: 'Sigue el estado de la entrega',
    body: 'Después de confirmar, consulta el avance del pedido desde la web. Cuando el reparto está en ruta y comparte GPS, puedes revisar su ubicación.',
  },
];

const questions = [
  {
    question: '¿Suya Delivery funciona en Sullana?',
    answer:
      'Sí. Suya está enfocada en conectar clientes con restaurantes, tiendas y negocios incorporados de Sullana, Piura. La disponibilidad final depende del horario, catálogo y zona habilitada por cada comercio.',
  },
  {
    question: '¿Puedo pedir comida a domicilio desde el celular?',
    answer:
      'Sí. Puedes usar Suya desde el navegador móvil y agregarla a la pantalla de inicio. El catálogo, el carrito, el pago habilitado y el seguimiento permanecen dentro del mismo flujo.',
  },
  {
    question: '¿Qué métodos de pago aparecen?',
    answer:
      'Cada negocio define los métodos disponibles. El checkout puede mostrar efectivo, Yape o Lemon cuando el comercio los haya configurado. Revisa siempre el destinatario, el monto y la confirmación antes de cerrar el pedido.',
  },
];

export function LocalDeliveryContent() {
  return (
    <section
      aria-labelledby="delivery-sullana-title"
      className="space-y-7 rounded-promo border border-suya-mist bg-white px-5 py-7 sm:px-8 sm:py-9"
    >
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-suya-green">
          Plataforma local
        </p>
        <h2
          id="delivery-sullana-title"
          className="mt-2 font-display text-2xl font-bold tracking-[-0.03em] sm:text-3xl"
        >
          Delivery en Sullana desde restaurantes y tiendas locales
        </h2>
        <p className="mt-3 text-sm leading-7 text-suya-muted sm:text-base">
          Suya Delivery reúne en una sola web negocios incorporados de Sullana para que puedas
          consultar cartas, precios y disponibilidad sin saltar entre publicaciones o mensajes.
          El objetivo es hacer más claro el pedido de comida a domicilio y otras compras locales:
          eliges un comercio, revisas el total antes de confirmar y consultas el estado desde el
          mismo lugar. El catálogo cambia según los horarios y la información publicada por cada
          negocio.
        </p>
        <nav aria-label="Guías de delivery local" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-suya-green">
          <Link to="/delivery-sullana" className="hover:underline">Delivery en Sullana</Link>
          <Link to="/comida-a-domicilio-sullana" className="hover:underline">Comida a domicilio</Link>
          <Link to="/restaurantes-delivery-sullana" className="hover:underline">Restaurantes con delivery</Link>
        </nav>
      </div>

      <div>
        <h2 className="font-display text-xl font-bold">¿Cómo pedir delivery en Sullana con Suya?</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-card bg-suya-ivory p-4">
              <span className="text-xs font-bold text-suya-green">PASO {index + 1}</span>
              <h3 className="mt-2 font-display text-base font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-suya-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <h2 className="font-display text-xl font-bold">Comida y compras locales en un catálogo</h2>
          <p className="mt-2 text-sm leading-7 text-suya-muted">
            Encuentra cevicherías, pollerías, comida criolla, opciones rápidas y otros comercios
            locales conforme se incorporan a la plataforma. La página de negocios permite comparar
            categorías, calificación, horario y costo de envío disponible. Así puedes elegir por la
            información del pedido, no solo por una publicación aislada.
          </p>
          <Link
            to="/stores"
            className="mt-3 inline-flex min-h-12 items-center font-semibold text-suya-green hover:underline"
          >
            Ver restaurantes y tiendas en Sullana
          </Link>
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Pagos y seguimiento con información clara</h2>
          <p className="mt-2 text-sm leading-7 text-suya-muted">
            Suya muestra el total antes de confirmar y presenta solo los métodos habilitados para el
            negocio. En pagos digitales debes verificar destinatario, monto y referencia. El estado
            del pedido se actualiza durante la preparación y el reparto; la ubicación del
            repartidor aparece únicamente cuando corresponde y está disponible.
          </p>
          <Link
            to="/help"
            className="mt-3 inline-flex min-h-12 items-center font-semibold text-suya-green hover:underline"
          >
            Consultar ayuda sobre pedidos y pagos
          </Link>
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl font-bold">Preguntas sobre delivery en Sullana</h2>
        <div className="mt-3 grid gap-3">
          {questions.map((item) => (
            <article key={item.question} className="rounded-card border border-suya-mist p-4">
              <h3 className="font-display text-base font-bold">{item.question}</h3>
              <p className="mt-2 text-sm leading-6 text-suya-muted">{item.answer}</p>
            </article>
          ))}
        </div>
      </div>

      <p className="border-t border-suya-mist pt-5 text-sm leading-6 text-suya-muted">
        Suya opera como plataforma tecnológica para negocios incorporados. Consulta nuestra{' '}
        <Link to="/privacidad" className="font-semibold text-suya-green hover:underline">
          política de privacidad
        </Link>{' '}
        y los{' '}
        <Link to="/terminos" className="font-semibold text-suya-green hover:underline">
          términos de uso
        </Link>{' '}
        antes de realizar un pedido.
      </p>
    </section>
  );
}
