# Cloudflare Pages: tres aplicaciones

Crear una vez tres proyectos **Direct Upload**. GitHub Actions compila los tres desde el mismo commit,
ejecuta gates y los carga con Wrangler fijado; no usar builds independientes del dashboard.

| Proyecto          | Build command local                  | Output directory  |
| ----------------- | ------------------------------------ | ----------------- |
| `suya-customer`   | `npm ci && npm run build:customer`   | `dist/customer`   |
| `suya-rider`      | `npm ci && npm run build:rider`      | `dist/rider`      |
| `suya-backoffice` | `npm ci && npm run build:backoffice` | `dist/backoffice` |

Variables públicas en los tres proyectos: `VITE_BACKEND=supabase`, `VITE_SUPABASE_URL` y
`VITE_SUPABASE_PUBLISHABLE_KEY`. Configurar además `VITE_EXPECTED_SUPABASE_PROJECT_REF` y las tres URL cruzadas de `.env.example`.
Nunca colocar `service_role` ni secretos de pago en Pages/Vite.

En Supabase Auth, registrar únicamente las URL exactas de los tres proyectos y del dominio final;
no usar comodines globales `*.pages.dev`, porque permitirían redirecciones a proyectos ajenos.

Cada build usa raíz `/`, por lo que cambiar de `*.pages.dev` al dominio comprado solo requiere
actualizar dominios/variables URL y lanzar un redeploy, sin modificar código. No se genera `404.html`: Pages reconoce una SPA cuando falta ese
archivo y sirve `index.html` para rutas profundas. Fuente:
<https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering>.

`rider` y `backoffice` no incluyen ni registran el service worker/manifest del cliente. Backoffice no
debe publicarse hasta que el guard de Auth y roles esté implementado y probado.

## Release canónico

El workflow manual `cloudflare-pages.yml` solo despliega desde `main` y el environment protegido
`cloudflare-production`. Requiere secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` y
`VITE_SUPABASE_PUBLISHABLE_KEY`; las demás variables están enumeradas en el workflow. El token debe
tener solo permiso de edición de Pages en la cuenta elegida.

`config/production.json` es la identidad canónica versionada. Suya usa el proyecto Supabase dedicado
`cggxooilzhqlcnofgtmi` en `us-east-1`.
Las variables del environment deben coincidir con ese archivo; así no basta cambiar juntas una URL y
una ref equivocadas, ni se pueden permutar las tres aplicaciones.

Antes de subir, comprueba que los tres proyectos existen, ejecuta todas las pruebas y rechaza bundles
con mocks o secretos. Direct Upload no puede convertirse después en Git Integration; no afecta el
cambio de `pages.dev` a dominio propio. Documentación oficial:
<https://developers.cloudflare.com/pages/get-started/direct-upload/> y
<https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/>.

La entrega sube y prueba primero tres previews. Al promover, guarda los deployments productivos
anteriores y ejecuta rollback por API si falla una app o el smoke final. La primera publicación no
tiene snapshot y exige activar conscientemente `allow_initial_release`.
