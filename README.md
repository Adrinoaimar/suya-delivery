# Suya Delivery

**Tu ciudad. Tus tiendas. Llegamos a ti.**

Aplicaciones publicadas:

- Cliente: <https://suyadelivery.com>
- Repartidor: <https://rider.suyadelivery.com>
- Backoffice: <https://panel.suyadelivery.com>

> Los bundles productivos usan Supabase y rechazan configuración incompleta o proveedores mock.
> Los mocks solo se cargan en desarrollo y pruebas explícitas.

Marketplace de delivery local de **Sullana, Piura, Perú**. Web app responsive **mobile-first**
construida con React + TypeScript + Vite + Tailwind CSS. El producto está en migración desde una
prueba local hacia tres aplicaciones conectadas a un backend Supabase exclusivo.

---

## Cómo ejecutarlo

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:5173>.

El build publicable usa Supabase y genera los tres bundles aislados; requiere las variables
productivas descritas en `.env.example`:

```bash
npm run build
```

`VITE_ANALYTICS_PROVIDER=suya` forma parte de esa configuración porque el medidor first-party
se valida como parte del build. Si falta cualquier variable, el build se detiene sin generar un
artefacto publicable.

Para generar deliberadamente la demo local con servicios mock, usa `npm run build:demo`.

Otros comandos:

```bash
npm run preview
```

```bash
npm run test
```

```bash
npm run lint
```

```bash
npm run typecheck
```

Para revisar la animación de entrada con calma, en desarrollo puedes alargarla:
<http://localhost:5173/?intro=8000> (se muestra una vez por pestaña; recarga con esa URL para
volver a verla).

---

## Despliegue

La publicación productiva usa **Cloudflare Pages** y está separada de la verificación de PR:

- `.github/workflows/deploy.yml` ejecuta typecheck, lint, secretos, pruebas y E2E en cada PR.
- `.github/workflows/cloudflare-pages.yml` publica desde `main`, primero en previews, valida las
  tres apps, SEO y rollback antes de promover.
- `.github/workflows/supabase-functions.yml` se ejecuta manualmente desde `main`; aplica
  migraciones y publica Edge Functions solo con los secretos protegidos de Supabase.
- `.github/workflows/mobile-android.yml` genera APK debug por rol; no son releases firmadas para
  Play Store. El CI Android QA exige proyecto Supabase y URLs de staging: `SUYA_STAGING_SUPABASE_URL`,
  `SUYA_STAGING_SUPABASE_PROJECT_REF`, `SUYA_STAGING_ROUTING_URL`,
  `SUYA_STAGING_CUSTOMER_APP_URL`, `SUYA_STAGING_RIDER_APP_URL`,
  `SUYA_STAGING_BACKOFFICE_APP_URL` en GitHub Actions Variables y
  `SUYA_STAGING_SUPABASE_PUBLISHABLE_KEY` en Secrets. Sin ellos, falla antes de compilar.
  `SUYA_STAGING_LIVE_UPDATE_BASE_URL` es opcional: vacío desactiva OTA en QA. Nunca reutilizar
  origen productivo. Estas APK debug 1.7/code 8 no actualizan instalaciones release con otra firma;
  una actualización distribuible necesita firma release compatible y prueba de instalación.

El build de cliente genera rutas SEO estáticas, `robots.txt`, `sitemap.xml` y `404.html`.
La release no es apta si `npm run verify:live` reporta funciones, MIME SEO o configuración remota
incompleta.

---

## Qué incluye

| Área                  | Rutas                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliente               | `/`, `/stores`, `/store/:id`, `/search`, `/cart`, `/checkout`, `/orders`, `/orders/:id`, `/orders/:id/track`, `/promotions`, `/profile`, `/help`, `/rider/:id` |
| Repartidor            | `/rider`, `/rider/current`, `/rider/safety`, `/rider/history`, `/rider/earnings`, `/rider/settings`                                                            |
| Contacto de confianza | `/share/:token`                                                                                                                                                |

- Marketplace con 13 negocios, 6 categorías, 94 productos y 5 promociones.
- **El Tío Jhony** integrado como negocio funcional (no beta): logotipo oficial y 33 platos con
  precios tomados de su menú físico y de [eltiojhony.com](https://eltiojhony.com). Su ficha
  (`/store/tio-jhony`) se muestra con la **paleta propia de la marca** (rojo `#8C1220`/`#D91E36`
  tomado de su sitio oficial) en vez del verde de Suya; el resto de la aplicación —carrito,
  checkout, navegación— conserva siempre la identidad Suya. Ver `Store.theme` en
  `src/types/index.ts` y `themeStyle()` en `StoreDetailPage.tsx`.
- **Fotografía real del negocio**: la portada de su ficha es la fachada de su local de Champagnat,
  13 platos llevan la foto del plato tomada de su propio menú y hay una galería con más fotos de su
  cocina y de sus otras sedes (`Store.gallery`). Los 20 platos restantes se muestran con la reserva
  neutra a propósito: **solo se asigna una foto cuando retrata ese plato**, nunca se rellena con la
  imagen de otro para que la carta no engañe. Los archivos viven en
  `public/images/stores/tio-jhony/` y proceden del material del propio restaurante; su uso queda
  registrado como autorizado en la publicación de catálogo.
- **Andá Paya** sigue en **fase beta**: carta norteña referencial, sin presencia web indexada que
  permita confirmarla, con distintivo «Beta», nota de datos y logo derivado de la cabecera de la
  carta autorizada. La carta original permanece visible en la galería hasta conciliar precios y
  datos operativos.
- Carrito persistente de un solo negocio, con extras, notas y cálculo de envío.
- Checkout con efectivo y billeteras digitales Yape/Lemon mediante intentos server-side, referencia
  única y código de constancia; tarjeta y QR Yape dinámico se habilitan mediante Culqi cuando la
  pasarela está configurada.
- Pedido con código `#SUY-XXXXX`, línea de tiempo de estados y seguimiento en mapa.
- Panel del repartidor con disponibilidad, viaje activo, historial y ganancias demo, y rastreo de
  ubicación obligatorio mientras el turno está activo.
- Módulo **Seguridad en ruta**: compartir ubicación, contacto de confianza, botón SOS y
  reporte de incidentes.
- Pantalla de carga animada de Sullana (SVG dibujado trazo a trazo + repartidor en ruta).
- PWA instalable (manifest, theme color, íconos, service worker de shell).

---

## Desarrollo local y modo demostración

| Función              | Estado actual |
| -------------------- | ------------- |
| Backend `supabase`   | Catálogo, pedidos, auth, RLS, realtime, pagos manuales, caja y observador de billeteras. |
| Backend de desarrollo | Sin `VITE_BACKEND=supabase`, los servicios mock se cargan únicamente para pruebas/local. |
| Mapa                 | Leaflet + OpenStreetMap; el rider solicita geometría e indicaciones al proxy autenticado `route-driving`. No se dibuja una línea recta como ruta vial. |
| Pagos                | Efectivo y Yape/Lemon manuales con intento server-side, QR público del negocio y verificación por evidencia; Culqi solo cuando está configurado. |
| Observador           | APK Android opt-in; captura notificaciones permitidas, cifra la cola en Android Keystore y nunca marca un pedido como pagado por sí sola. |
| Ubicación y seguridad | GPS real, rastreo autorizado, SOS e incidentes persistentes en Supabase. |
| Analítica             | First-party, opt-in, un visitante único por día mediante digest; agregados visibles solo a `platform_admin`. |

### Probar el módulo de seguridad

1. Abre `/rider/safety` y activa **Compartir mi ubicación** (el modo simulado viene activo, así
   que no necesitas GPS).
2. Copia el enlace generado (`/share/demo-XXXXXXX`) y ábrelo en **otra pestaña del mismo
   navegador**.
3. Verás la posición actualizarse; al activar el SOS aparece la alerta en esa pestaña.

---

## Pendientes de publicación

El código y las pruebas están preparados, pero la auditoría live actual aún requiere:

- aplicar la migración de analítica y las Edge Functions en el proyecto Supabase de producción;
- corregir la publicación productiva de `robots.txt`/`sitemap.xml` (hoy el dominio devuelve el
  fallback HTML) y confirmar que `route-driving` responda;
- configurar los secretos protegidos de Supabase/Cloudflare antes de ejecutar la release;
- ejecutar pruebas físicas en un teléfono Android y firmar APK release antes de distribuirlas.

La evidencia se actualiza en `docs/STATE.md` y `docs/execution/F31.md`.

---

## Archivos clave

| Quiero cambiar…               | Edito                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Logo y símbolo en la app      | `src/components/common/Logo.tsx`                                                                                   |
| Archivos de marca (SVG)       | `public/brand/` (`suya-logo.svg`, `suya-logo-horizontal.svg`, `suya-icon.svg`, `iglesia-sullana.svg`, `rider.svg`) |
| Colores y tokens              | `tailwind.config.js` y las variables CSS de `src/styles/index.css`                                                 |
| Tipografías                   | `src/styles/index.css` (paquetes `@fontsource/montserrat` e `@fontsource/inter`)                                   |
| Negocios                      | `src/data/stores.json`                                                                                             |
| Productos                     | `src/data/products.json`                                                                                           |
| Categorías                    | `src/data/categories.json`                                                                                         |
| Promociones                   | `src/data/promotions.json`                                                                                         |
| Repartidores                  | `src/data/riders.json`                                                                                             |
| Historial demo de pedidos     | `src/data/orders.json`                                                                                             |
| Ruta del seguimiento          | `src/data/route.json`                                                                                              |
| Pantalla de carga             | `src/components/common/SuyaIntroLoader.tsx`, `src/styles/intro-loader.css`, `src/assets/loader/sullana-scene.svg`  |
| Mapas y proveedores           | `src/components/map/` (`MapProvider.tsx`, `MockMap.tsx`, `LeafletMap.tsx`, `GoogleMapAdapter.tsx`)                 |
| Tiempos de la simulación      | `src/lib/services/MockOrderService.ts` (`SIMULATION_STEPS`)                                                        |
| Claves de almacenamiento      | `src/lib/storage.ts`                                                                                               |
| Imágenes reales               | `public/images/README.md` explica dónde ponerlas                                                                   |
| Fotos y galería de un negocio | `src/data/stores.json` (`image`, `logo`, `gallery`) y el campo `image` de cada plato en `src/data/products.json`   |
| Paleta propia de un negocio   | `src/data/stores.json` → campo `theme` del negocio                                                                 |

### Cambiar el proveedor de mapa

Crea un archivo `.env.local` (ver `.env.example`):

```bash
VITE_MAP_PROVIDER=osm
```

- `osm`: OpenStreetMap mediante Leaflet, necesita internet.
- `google`: requiere además `VITE_GOOGLE_MAPS_KEY`; hoy el adaptador delega en el mapa local.

---

## Marcas y datos

Precios, horarios, promociones, calificaciones, productos, repartidores y direcciones son
**ficticios**. Las fichas locales tienen activos de marca documentados: KFC, Papa John's, Tottus e
Inkafarma usan sus activos públicos oficiales y las fichas locales restantes usan marcas
tipográficas reemplazables. No se recrean logotipos corporativos; las fuentes están en
`public/brand/stores/CREDITS.md`. La silueta arquitectónica de Sullana
es un `PLACEHOLDER IGLESIA SULLANA` pensado para reemplazarse por el activo oficial con el mismo
`viewBox`.

---

## Estructura

```text
src/
├── app/          # utilidades de aplicación (scroll, providers)
├── assets/       # escena SVG del loader
├── components/   # common, layout, marketplace, order, rider, safety, map
├── data/         # DEMO DATA en JSON
├── hooks/        # diálogos, media queries, geolocalización, simulación
├── layouts/      # CustomerLayout, RiderLayout
├── lib/          # storage, cn y services (contratos + implementaciones mock)
├── pages/        # customer, rider, shared
├── routes/       # definición de rutas con carga diferida
├── store/        # Zustand: carrito, pedidos, usuario, repartidor, UI
├── styles/       # Tailwind + tokens + intro-loader.css
├── types/        # modelos de dominio
└── utils/        # formato, geo, horarios, ids
```

---

## Accesibilidad y rendimiento

- Objetivos táctiles de 44×44 px como mínimo, foco visible, `aria` en diálogos y navegación.
- `prefers-reduced-motion` respetado (incluida una versión estática del loader) y preferencia
  manual en el perfil.
- Rutas con `React.lazy` y separación de `react` y `leaflet` en chunks propios.
- Sin dependencia de red para funcionar: el mapa por defecto no descarga tiles.
