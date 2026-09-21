# Auditoría SEO de imágenes

Fecha: 2026-09-21 (`America/Lima`)

## Resultado del código renderizado

| Métrica | Estado | Conteo |
| --- | --- | ---: |
| Elementos `<img>` en componentes React | Revisado | 16 |
| Sin texto alternativo | Correcto | 0 |
| Sin dimensiones declaradas | Correcto | 0 |
| Sin política de carga explícita | Correcto | 0 |
| Sin decodificación explícita | Correcto | 0 |

Las imágenes informativas tienen texto alternativo contextual. Los activos decorativos conservan
`alt=""` y, cuando corresponde, `aria-hidden`. Las portadas visibles al abrir una ficha o carta usan
carga inmediata y prioridad alta; miniaturas y contenido bajo el pliegue usan carga diferida. Todas
las imágenes reservan ancho/alto para evitar CLS. PR #57 prioriza las dos primeras tarjetas destacadas
de Inicio y precarga tres portadas WebP conocidas; rutas secundarias no reciben esas precargas.

## Formatos y peso

- Las portadas productivas pesadas de Andá Paya y Donde Joel se resuelven a WebP mediante
  `assetUrl`, sin cambiar las URLs históricas almacenadas.
- Las cartas originales JPEG pesan entre 186 y 284 KB; se cargan bajo demanda en la galería y se
  mantienen como evidencia suministrada por el negocio.
- Dos artes PNG de marketing superiores a 2 MB no están referenciados por la aplicación pública y
  no participan en LCP ni en el tráfico de una visita normal.
- El PNG maestro usado para Open Graph pesa 471 KB; no se descarga durante la navegación normal.
  Se conserva para compatibilidad de previsualización social.

## Hallazgos pendientes

No quedan errores críticos o altos de imágenes en las rutas públicas. Como mejora futura de bajo
impacto se puede generar una tarjeta social rasterizada de 1200×630 más liviana, manteniendo el
archivo maestro fuera del camino crítico.
