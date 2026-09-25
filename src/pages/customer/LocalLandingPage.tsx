import { Link } from 'react-router-dom';
import { SeoHead } from '@/components/common/SeoHead';

type LandingKind = 'delivery' | 'food' | 'restaurants';

interface LandingSection {
  title: string;
  paragraphs: string[];
  items?: string[];
}

interface LandingContent {
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  schemaType: 'Service' | 'CollectionPage';
  sections: LandingSection[];
}

const SITE_ORIGIN = 'https://suyadelivery.com';

const CONTENT: Record<LandingKind, LandingContent> = {
  delivery: {
    path: '/delivery-sullana',
    title: 'Delivery en Sullana: comida y compras a domicilio | Suya',
    description:
      'Encuentra delivery de comida, restaurantes, tiendas y negocios locales en Sullana con Suya. Revisa carta, total y pago antes de confirmar; consulta el estado en Mis pedidos.',
    eyebrow: 'Servicio local',
    heading: 'Delivery en Sullana para pedir comida y compras locales',
    intro:
      'Suya Delivery conecta restaurantes, tiendas y negocios incorporados de Sullana, Piura, en un solo catálogo. Explora opciones disponibles, revisa la información del comercio y confirma tu pedido desde la web.',
    schemaType: 'Service',
    sections: [
      {
        title: '¿Qué puedes pedir con delivery en Sullana?',
        paragraphs: [
          'La oferta depende de los negocios incorporados y de su disponibilidad. Puedes encontrar comida peruana, cevicherías, pollerías, comida rápida, bebidas y compras locales cuando cada comercio publica su catálogo y habilita pedidos.',
          'Cada ficha muestra la información disponible del negocio: productos, precios, horario, calificación y costo de envío. La zona de entrega, el tiempo y los métodos de pago pueden cambiar; confirma siempre el resumen antes de pagar.',
        ],
      },
      {
        title: 'Cómo pedir delivery en Sullana con Suya',
        paragraphs: [
          'Empieza en el directorio, elige una categoría o busca un negocio, abre su carta y agrega productos al carrito. En el checkout revisa cantidades, dirección, método de pago y total. Después de confirmar, consulta el estado del pedido desde Mis pedidos.',
        ],
        items: [
          'Explora restaurantes, tiendas y categorías disponibles.',
          'Compara carta, horario, calificación y costo de envío.',
          'Confirma el pedido solo después de revisar el total.',
          'Consulta el estado del pedido desde Mis pedidos.',
        ],
      },
      {
        title: 'Pagos y estado del pedido',
        paragraphs: [
          'Suya presenta únicamente los métodos configurados por cada comercio. En pagos digitales, ingresa el monto exacto solicitado; el local recibe el pedido cuando el pago se confirma. No compartas contraseñas ni códigos fuera del flujo oficial. Consulta el estado en Mis pedidos; el mapa y GPS del repartidor no se muestran al cliente.',
        ],
      },
    ],
  },
  food: {
    path: '/comida-a-domicilio-sullana',
    title: 'Comida a domicilio en Sullana | Suya Delivery',
    description:
      'Pide comida a domicilio en Sullana desde Suya: revisa restaurantes, cartas, precios, horarios y pagos; consulta el estado del pedido en Mis pedidos.',
    eyebrow: 'Comida a domicilio',
    heading: 'Comida a domicilio en Sullana con información clara',
    intro:
      'Busca opciones de comida a domicilio en Sullana sin saltar entre publicaciones. Suya reúne cartas de negocios incorporados para que compares la información disponible y confirmes tu pedido con el total visible.',
    schemaType: 'CollectionPage',
    sections: [
      {
        title: 'Encuentra restaurantes y cartas disponibles',
        paragraphs: [
          'Explora categorías como comida peruana, cevicherías, pollerías, comida rápida y bebidas conforme cada negocio habilita su catálogo. Los productos, precios y horarios pertenecen a cada comercio y se actualizan según la información que publica.',
          'Antes de elegir, revisa qué productos están disponibles, si el negocio recibe pedidos, el costo de envío y la zona de entrega. No todos los negocios aparecen abiertos durante todo el día.',
        ],
      },
      {
        title: 'Pedido de comida paso a paso',
        paragraphs: [
          'Abre una carta, selecciona productos y cantidades, revisa el carrito y completa la dirección. Suya muestra el método de pago configurado y el total antes de confirmar. Consulta el estado del pedido desde Mis pedidos.',
        ],
        items: [
          'Revisa ingredientes, cantidades y precio antes de agregar.',
          'Confirma dirección y referencias de entrega.',
          'Verifica destinatario y monto en pagos digitales.',
          'Consulta el estado del pedido desde Mis pedidos.',
        ],
      },
      {
        title: 'Comida local y delivery responsable',
        paragraphs: [
          'Suya opera como plataforma tecnológica para negocios incorporados. La disponibilidad real depende del comercio, su horario, catálogo y cobertura. Consulta la carta vigente en cada pedido y evita compartir datos de acceso por canales externos.',
        ],
      },
    ],
  },
  restaurants: {
    path: '/restaurantes-delivery-sullana',
    title: 'Restaurantes con delivery en Sullana | Suya',
    description:
      'Explora restaurantes con delivery en Sullana, compara cartas, horarios, calificaciones y envío, y confirma tu pedido con Suya Delivery.',
    eyebrow: 'Restaurantes locales',
    heading: 'Restaurantes con delivery en Sullana',
    intro:
      'Suya reúne restaurantes incorporados de Sullana para consultar sus cartas desde una sola web. Filtra negocios y revisa la información disponible antes de elegir dónde pedir.',
    schemaType: 'CollectionPage',
    sections: [
      {
        title: 'Elige por categoría y disponibilidad',
        paragraphs: [
          'Consulta restaurantes de comida peruana, cevicherías, pollerías, comida rápida y otras categorías que se incorporen a Suya. El directorio permite revisar negocios disponibles, ordenar por recomendación, tiempo, calificación o envío y filtrar los que están abiertos.',
          'La lista cambia según horario, catálogo y configuración del restaurante. Una ficha puede estar cerrada, sin productos o fuera de la zona de entrega; revisa el estado que aparece en pantalla.',
        ],
      },
      {
        title: 'Qué revisar antes de confirmar',
        paragraphs: [
          'Abre la carta del restaurante, revisa productos y cantidades, consulta el costo de envío y comprueba el total. En checkout verifica dirección, método de pago y referencia. La información comercial debe confirmarse en cada pedido porque puede cambiar.',
        ],
        items: [
          'Carta y productos disponibles.',
          'Horario y estado de recepción de pedidos.',
          'Calificación y costo de envío mostrado.',
          'Total, destinatario y referencia del pago.',
        ],
      },
    ],
  },
};

function schemaFor(content: LandingContent) {
  const url = `${SITE_ORIGIN}${content.path}/`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_ORIGIN}/#organization`,
        name: 'Suya Delivery',
        url: `${SITE_ORIGIN}/`,
      },
      {
        '@type': content.schemaType,
        name: content.heading,
        description: content.description,
        url,
        isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
        about: { '@type': 'City', name: 'Sullana, Piura, Perú' },
        inLanguage: 'es-PE',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: content.heading, item: url },
        ],
      },
    ],
  };
}

export default function LocalLandingPage({ kind }: { kind: LandingKind }) {
  const content = CONTENT[kind];
  return (
    <>
      <SeoHead
        title={content.title}
        description={content.description}
        path={content.path}
        schema={schemaFor(content)}
      />
      <div className="shell py-6 lg:py-10">
        <article className="mx-auto max-w-3xl rounded-promo border border-suya-mist bg-white px-5 py-7 sm:px-8 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-suya-green">{content.eyebrow}</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.03em]">{content.heading}</h1>
          <p className="mt-5 text-sm leading-7 text-suya-muted sm:text-base">{content.intro}</p>
          <div className="mt-7 space-y-6 text-sm leading-7 text-suya-muted sm:text-base">
            {content.sections.map((section) => (
              <section key={section.title}>
                <h2 className="font-display text-xl font-bold text-suya-carbon">{section.title}</h2>
                {section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-2">{paragraph}</p>)}
                {section.items && (
                  <ul className="mt-3 list-disc space-y-1 pl-5">
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </section>
            ))}
          </div>
          <nav aria-label="Enlaces relacionados" className="mt-7 flex flex-wrap gap-x-5 gap-y-3 font-semibold text-suya-green">
            <Link to="/stores">Ver restaurantes y tiendas</Link>
            <Link to="/help">Consultar ayuda</Link>
            <Link to="/">Volver al inicio</Link>
          </nav>
        </article>
      </div>
    </>
  );
}

export { CONTENT };
