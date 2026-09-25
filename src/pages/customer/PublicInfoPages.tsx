import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SeoHead } from '@/components/common/SeoHead';

const UPDATED_AT = '21 de septiembre de 2026';
const SITE_ORIGIN = 'https://suyadelivery.com';

function publicPageSchema(
  type: 'AboutPage' | 'ContactPage' | 'WebPage',
  path: string,
  name: string,
  description: string,
) {
  const url = `${SITE_ORIGIN}${path}`;
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
        '@type': type,
        name,
        description,
        url,
        inLanguage: 'es-PE',
        about: { '@id': `${SITE_ORIGIN}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Inicio',
            item: `${SITE_ORIGIN}/`,
          },
          { '@type': 'ListItem', position: 2, name, item: url },
        ],
      },
    ],
  };
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell py-6 lg:py-10">
      <article className="mx-auto max-w-3xl rounded-promo border border-suya-mist bg-white px-5 py-7 sm:px-8 sm:py-10">
        {children}
      </article>
    </div>
  );
}

function UpdatedAt() {
  return <p className="mt-2 text-xs text-suya-muted">Última actualización: {UPDATED_AT}</p>;
}

export function AboutPage() {
  return (
    <>
      <SeoHead
        title="Sobre Suya Delivery | Plataforma local de Sullana"
        description="Conoce cómo Suya Delivery conecta clientes con restaurantes, tiendas y negocios incorporados de Sullana, Piura."
        path="/nosotros"
        schema={publicPageSchema(
          'AboutPage',
          '/nosotros',
          'Sobre Suya Delivery',
          'Conoce cómo Suya Delivery conecta clientes con restaurantes, tiendas y negocios incorporados de Sullana, Piura.',
        )}
      />
      <PageShell>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-suya-green">Sobre Suya</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.03em]">
          Una plataforma de delivery creada para Sullana
        </h1>
        <UpdatedAt />
        <div className="mt-6 space-y-5 text-sm leading-7 text-suya-muted sm:text-base">
          <p>
            Suya Delivery es una plataforma tecnológica local que reúne restaurantes, tiendas y
            otros negocios incorporados de Sullana, Piura. Su propósito es facilitar que una persona
            encuentre un catálogo vigente, revise precios y confirme un pedido desde un solo flujo.
            La información comercial y la disponibilidad dependen de cada negocio participante.
          </p>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Qué hacemos</h2>
            <p className="mt-2">
              Conectamos el catálogo del comercio, el carrito del cliente, la confirmación del pago
              habilitado y el estado del pedido. El cliente puede consultar ese estado desde Mis
              pedidos; el mapa y el GPS del repartidor no se muestran.
              Suya también ofrece herramientas operativas separadas para comercios y repartidores.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Enfoque local</h2>
            <p className="mt-2">
              El servicio empieza en Sullana. No publicamos cifras, tiempos de entrega, cobertura ni
              calificaciones que no estén respaldados por la operación. Cada negocio mantiene su
              propio horario, catálogo, precio y zona disponible. Esa información puede cambiar y
              debe confirmarse dentro del pedido.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Principios</h2>
            <p className="mt-2">
              Buscamos información clara antes de pagar, privacidad por diseño y separación entre
              las áreas públicas y operativas. La ubicación exacta se solicita cuando hace falta
              completar una entrega. La medición de visitas es opcional y usa identificadores
              anónimos, sin guardar IP, nombre ni correo en el contador diario.
            </p>
          </section>
          <p>
            Puedes empezar en el directorio de{' '}
            <Link to="/stores" className="font-semibold text-suya-green hover:underline">
              restaurantes y tiendas de Sullana
            </Link>{' '}
            o revisar el{' '}
            <Link to="/help" className="font-semibold text-suya-green hover:underline">
              centro de ayuda
            </Link>
            .
          </p>
        </div>
      </PageShell>
    </>
  );
}

export function ContactPage() {
  return (
    <>
      <SeoHead
        title="Contacto y ayuda | Suya Delivery Sullana"
        description="Encuentra los canales disponibles para resolver dudas sobre pedidos, pagos y negocios en Suya Delivery Sullana."
        path="/contacto"
        schema={publicPageSchema(
          'ContactPage',
          '/contacto',
          'Contacto y ayuda de Suya Delivery',
          'Encuentra los canales disponibles para resolver dudas sobre pedidos, pagos y negocios en Suya Delivery Sullana.',
        )}
      />
      <PageShell>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-suya-green">Contacto</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.03em]">
          Ayuda para clientes y negocios de Sullana
        </h1>
        <UpdatedAt />
        <div className="mt-6 space-y-5 text-sm leading-7 text-suya-muted sm:text-base">
          <p>
            Suya todavía no publica un teléfono general ni un correo de soporte. No queremos mostrar
            un canal inexistente. Mientras se habilita atención central, cada pedido conserva su
            estado e información dentro de la plataforma.
          </p>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Si ya hiciste un pedido</h2>
            <p className="mt-2">
              Abre <Link to="/orders" className="font-semibold text-suya-green hover:underline">Mis pedidos</Link>{' '}
              para consultar el estado, el negocio y el reparto disponible. No compartas códigos de
              confirmación, credenciales ni comprobantes fuera del flujo indicado en pantalla.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Antes de pedir</h2>
            <p className="mt-2">
              Consulta el <Link to="/help" className="font-semibold text-suya-green hover:underline">centro de ayuda</Link>{' '}
              para revisar pagos, estado del pedido, privacidad e instalación de la web como aplicación.
              En emergencias reales usa los números oficiales 105 o 116.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Para negocios</h2>
            <p className="mt-2">
              La incorporación de comercios se administra de forma verificada desde el Backoffice.
              Suya no solicita contraseñas por páginas públicas ni genera accesos improvisados.
            </p>
          </section>
        </div>
      </PageShell>
    </>
  );
}

export function PrivacyPage() {
  return (
    <>
      <SeoHead
        title="Política de privacidad | Suya Delivery"
        description="Consulta qué datos usa Suya Delivery para operar pedidos, pagos, ubicación y medición anónima de visitas."
        path="/privacidad"
        schema={publicPageSchema(
          'WebPage',
          '/privacidad',
          'Política de privacidad de Suya Delivery',
          'Consulta qué datos usa Suya Delivery para operar pedidos, pagos, ubicación y medición anónima de visitas.',
        )}
      />
      <PageShell>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-suya-green">Privacidad</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.03em]">
          Política de privacidad de Suya Delivery
        </h1>
        <UpdatedAt />
        <div className="mt-6 space-y-5 text-sm leading-7 text-suya-muted sm:text-base">
          <p>
            Suya usa únicamente la información necesaria para autenticar cuentas, preparar pedidos,
            procesar el método de pago elegido y coordinar una entrega. Los permisos dependen del rol
            del usuario y del pedido en el que participa.
          </p>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Datos de cuenta y pedido</h2>
            <p className="mt-2">
              Una cuenta puede incluir nombre, correo y datos de acceso administrados por el servicio
              de autenticación. Un pedido puede incluir nombre de entrega, teléfono, dirección,
              referencia, productos, importes, estados y registros necesarios para resolver su flujo.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Ubicación</h2>
            <p className="mt-2">
              La ubicación exacta del cliente se solicita al confirmar una entrega. La ubicación del
              repartidor se comparte durante el servicio cuando el permiso está activo. Suya no
              envía la dirección del cliente a geocodificadores públicos dentro del flujo descrito.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Medición de visitas</h2>
            <p className="mt-2">
              La analítica pública es opcional. Si aceptas, el navegador crea un identificador
              aleatorio y el servidor conserva un resumen diario irreversible. El contador no guarda
              IP, nombre, correo, ruta visitada ni contenido del pedido.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Pagos y seguridad</h2>
            <p className="mt-2">
              Suya conserva referencias y estados necesarios para verificar pagos. No debes enviar
              contraseñas ni claves privadas. Los accesos operativos, pedidos y billeteras aplican
              permisos separados en el servidor.
            </p>
          </section>
          <p>
            Para dudas operativas usa la página de <Link to="/contacto" className="font-semibold text-suya-green hover:underline">contacto y ayuda</Link>.
          </p>
        </div>
      </PageShell>
    </>
  );
}

export function TermsPage() {
  return (
    <>
      <SeoHead
        title="Términos de uso | Suya Delivery"
        description="Revisa las condiciones para usar el catálogo, los pedidos, pagos y consulta de estado en Suya Delivery en Sullana."
        path="/terminos"
        schema={publicPageSchema(
          'WebPage',
          '/terminos',
          'Términos de uso de Suya Delivery',
          'Revisa las condiciones para usar el catálogo, los pedidos, pagos y consulta de estado en Suya Delivery en Sullana.',
        )}
      />
      <PageShell>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-suya-green">Condiciones</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.03em]">
          Términos de uso de Suya Delivery
        </h1>
        <UpdatedAt />
        <div className="mt-6 space-y-5 text-sm leading-7 text-suya-muted sm:text-base">
          <p>
            Al usar Suya aceptas utilizar la plataforma de forma lícita y proporcionar información
            suficiente para completar el pedido. El catálogo, los horarios, los precios y la zona
            disponible son responsabilidad de cada negocio incorporado y pueden cambiar.
          </p>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Pedidos</h2>
            <p className="mt-2">
              Revisa productos, cantidades, dirección, método de pago y total antes de confirmar. Un
              pedido solo debe avanzar como pagado cuando el flujo autorizado verifica el movimiento.
              No reutilices códigos ni referencias de otro pedido.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Disponibilidad y entrega</h2>
            <p className="mt-2">
              La aceptación depende del negocio. Los tiempos mostrados son estimaciones operativas,
              no garantías. Clima, tránsito, preparación, dirección o disponibilidad del repartidor
              pueden cambiar la entrega.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Uso permitido</h2>
            <p className="mt-2">
              No intentes acceder a cuentas ajenas, manipular pagos, automatizar pedidos abusivos,
              extraer datos protegidos ni interferir con la operación. Suya puede limitar accesos
              cuando exista riesgo de seguridad, fraude o incumplimiento.
            </p>
          </section>
          <section>
            <h2 className="font-display text-xl font-bold text-suya-carbon">Cambios</h2>
            <p className="mt-2">
              Estas condiciones pueden actualizarse conforme evolucione el servicio. La fecha visible
              identifica la versión publicada. Consulta también la <Link to="/privacidad" className="font-semibold text-suya-green hover:underline">política de privacidad</Link>.
            </p>
          </section>
        </div>
      </PageShell>
    </>
  );
}
