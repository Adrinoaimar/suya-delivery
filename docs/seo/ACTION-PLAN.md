# Plan SEO de Suya Delivery

## P0 — aplicado

1. Publicar archivos reales `robots.txt` y `sitemap.xml`.
2. Añadir canonical, robots, Open Graph, Twitter Card y JSON-LD a la web cliente.
3. Excluir rutas privadas y operativas de indexación.
4. Corregir la jerarquía `h1` de tiendas y el texto del enlace de categorías.
5. Reducir activos PNG grandes y reservar dimensiones de imágenes.
6. Permitir el beacon que Cloudflare inyecta en la CSP.
7. Aplicar `20260921100000_optimize_public_asset_urls.sql` para servir imágenes desde el dominio propio.
8. Generar HTML estático con metadatos y Schema específicos para `/stores`, `/help` y los menús públicos.
9. Priorizar portadas visibles y precargar activos destacados solo en Inicio para reducir descubrimiento tardío de LCP.
10. Ampliar el shell HTML público con respuestas locales y enlaces internos, sin duplicar datos comerciales no verificados.
11. Añadir páginas locales de intención para `delivery en Sullana`, `comida a domicilio en Sullana` y `restaurantes con delivery en Sullana`, con contenido factual y enlazado interno.

## P1 — inmediatamente después de publicar

1. Verificar el dominio en Google Search Console y enviar `https://suyadelivery.com/sitemap.xml`.
2. Solicitar indexación de `/`, `/stores`, `/help`, las páginas institucionales y las cartas reales.
3. Confirmar en inspección de URL que Google recibe canonical, HTML estático, Schema y respuesta 200.
4. Crear o completar Google Business Profile solo con identidad, área de servicio, contacto y horarios
   reales; no inventar una dirección abierta al público.
5. Conseguir reseñas de clientes reales y menciones coherentes en directorios/medios locales. Nunca
   comprar reseñas, intercambiar enlaces ni generar ubicaciones ficticias.

## P2 — autoridad y rendimiento

1. Publicar contenido útil y verificable para búsquedas locales concretas, enlazando negocios y cartas
   disponibles; evitar páginas repetitivas creadas solo para palabras clave.
2. Separar autenticación y servicios Supabase no críticos del paquete inicial de React.
3. Medir INP, LCP y CLS con datos de campo durante 28 días y revisar consultas/CTR en Search Console.
4. Revisar posiciones por dispositivo y ubicación sin usar búsquedas personales como única evidencia.

## Criterio de publicación

No desplegar esta tanda SEO hasta revisar el diff, pasar `verify:production` y confirmar que las rutas
del sitemap responden `200` en producción. La primera posición no es un criterio técnico garantizable;
el objetivo medible es indexación correcta, crecimiento de impresiones, CTR, posiciones y pedidos
orgánicos. El medidor propio de visitas ya publicado no usa proveedores de terceros.

## Estado 2026-09-21

La revalidación posterior no encontró errores críticos o altos técnicos. PR #57 tiene CI completo
verde, pero sigue pendiente de autorización para merge/publicación. `/stores/` conserva LCP mayor a
2.5 s en medición puntual y queda como prioridad de rendimiento.
