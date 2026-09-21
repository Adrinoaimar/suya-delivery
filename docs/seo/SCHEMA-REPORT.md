# Informe de datos estructurados

## Implementado

- Inicio: `Organization`, `WebSite` y `Service`.
- Ficha de negocio: `Restaurant` con nombre, descripción, URL, imagen disponible, dirección pública, categorías y ciudad.
- Menú público: `Restaurant` con nombre, descripción, URL, imagen disponible, dirección pública, categorías y ciudad.

## Decisiones de calidad

- No se añadió `FAQPage`: el contenido es una página comercial de ayuda y no se debe forzar un resultado enriquecido no garantizado.
- No se añadió `HowTo`, `Review`, `AggregateRating`, `Offer` ni teléfono inventado.
- Las imágenes y URLs se generan absolutas bajo `https://suyadelivery.com`.
- El JSON-LD dinámico reemplaza un único nodo `#suya-seo-schema`, evitando duplicados al navegar.

## Validación

El HTML construido contiene JSON-LD, canonical, Open Graph y Twitter Card. La validación automática local confirmó que los campos críticos están presentes; la validación final con Rich Results Test debe hacerse después de publicar.
