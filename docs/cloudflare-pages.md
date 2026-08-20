# Cloudflare Pages: tres aplicaciones

Crear tres proyectos Pages conectados al mismo repositorio y rama. Usar Build System V2, Node 22 y
estas configuraciones:

| Proyecto sugerido | Build command | Output directory |
| --- | --- | --- |
| `suya-customer` | `npm ci && npm run build:customer` | `dist/customer` |
| `suya-rider` | `npm ci && npm run build:rider` | `dist/rider` |
| `suya-backoffice` | `npm ci && npm run build:backoffice` | `dist/backoffice` |

Variables públicas en los tres proyectos: `VITE_BACKEND=supabase`, `VITE_SUPABASE_URL` y
`VITE_SUPABASE_PUBLISHABLE_KEY`. Configurar además las tres URL cruzadas de `.env.example`.
Nunca colocar `service_role` ni secretos de pago en Pages/Vite.

Cada build usa raíz `/`, por lo que cambiar de `*.pages.dev` al dominio comprado solo requiere
actualizar dominios/variables URL y lanzar un redeploy, sin modificar código. No se genera `404.html`: Pages reconoce una SPA cuando falta ese
archivo y sirve `index.html` para rutas profundas. Fuente:
<https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering>.

`rider` y `backoffice` no incluyen ni registran el service worker/manifest del cliente. Backoffice no
debe publicarse hasta que el guard de Auth y roles esté implementado y probado.
