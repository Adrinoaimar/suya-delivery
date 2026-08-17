# Suya Delivery

**Tu ciudad. Tus tiendas. Llegamos a ti.**

**Demo en vivo:** <https://adrinoaimar.github.io/suya-delivery/>

Marketplace de delivery local de **Sullana, Piura, Perú**. Web app responsive **mobile-first**
construida con React + TypeScript + Vite + Tailwind CSS. Esta primera versión es una
**demostración local sin base de datos**: todo funciona en el navegador para validar la
experiencia antes de conectar backend, pagos o apps nativas.

---

## Cómo ejecutarlo

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:5173>.

Otros comandos:

```bash
npm run build
```

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

El repositorio se publica solo en **GitHub Pages** con el workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): en cada push a `main` verifica
tipos, estilo y pruebas, construye y despliega.

- El sitio vive bajo `/<repo>/`, por eso el build recibe `VITE_BASE=/suya-delivery/` y la app usa
  `import.meta.env.BASE_URL` (router, service worker, placeholders y enlace de seguimiento).
- `scripts/prepare-pages.mjs` copia `index.html` a `404.html` para que las rutas profundas
  (`/orders`, `/rider/safety`, `/share/:token`) funcionen al recargar.
- Para servirlo en la raíz de un dominio propio, construye sin `VITE_BASE` (o con `/`).

---

## Qué incluye

| Área | Rutas |
| --- | --- |
| Cliente | `/`, `/stores`, `/store/:id`, `/search`, `/cart`, `/checkout`, `/orders`, `/orders/:id`, `/orders/:id/track`, `/promotions`, `/profile`, `/help`, `/rider/:id` |
| Repartidor | `/rider`, `/rider/current`, `/rider/safety`, `/rider/history`, `/rider/earnings`, `/rider/settings` |
| Contacto de confianza | `/share/:token` |

- Marketplace con 11 negocios, 6 categorías, 55 productos y 5 promociones.
- Carrito persistente de un solo negocio, con extras, notas y cálculo de envío.
- Checkout con métodos de pago simulados (efectivo, Yape, tarjeta) y cupones demo.
- Pedido con código `#SUY-XXXXX`, línea de tiempo de estados y seguimiento en mapa.
- Panel del repartidor con disponibilidad, viaje activo, historial y ganancias demo.
- Módulo **Seguridad en ruta**: compartir ubicación, contacto de confianza, botón SOS y
  reporte de incidentes.
- Pantalla de carga animada de Sullana (SVG dibujado trazo a trazo + repartidor en ruta).
- PWA instalable (manifest, theme color, íconos, service worker de shell).

---

## Modo demostración: qué se está simulando

| Función | Cómo funciona hoy |
| --- | --- |
| Datos de negocios y productos | JSON locales en `src/data/` (**DEMO DATA**) |
| Pedidos y carrito | `localStorage` (`suya_cart`, `suya_orders`) |
| Estados del pedido | Simulación local: 0 s confirmado → 8 s preparando → 18 s recogido → 28 s en camino → 60 s entregado. Se puede reiniciar desde el seguimiento |
| Movimiento del repartidor | Interpolación sobre una polilínea de Sullana (`src/data/route.json`) |
| Mapa | `MockMap` en SVG, sin red ni API key. Adaptadores listos para Leaflet/OpenStreetMap y Google Maps |
| Pagos | `MockPaymentService`: no existe pasarela ni cobro real |
| Notificaciones | Toasts locales, no push |
| Compartir ubicación | `BroadcastChannel` + `localStorage`: sincroniza **entre pestañas del mismo navegador**, no entre dispositivos |
| SOS | Registra hora y estado en el dispositivo y avisa visualmente en `/share/:token`. **No contacta a la policía ni a emergencias** |
| Cuentas | Sin credenciales: se elige perfil cliente o repartidor desde `/profile` |

### Probar el módulo de seguridad

1. Abre `/rider/safety` y activa **Compartir mi ubicación** (el modo simulado viene activo, así
   que no necesitas GPS).
2. Copia el enlace generado (`/share/demo-XXXXXXX`) y ábrelo en **otra pestaña del mismo
   navegador**.
3. Verás la posición actualizarse; al activar el SOS aparece la alerta en esa pestaña.

---

## Pendiente para producción

Nada de esto está implementado y la arquitectura ya deja el lugar donde va:

- Backend y base de datos (pedidos, catálogos, comercios, repartidores, administradores).
- Autenticación real y roles.
- Pasarela de pagos (Yape/tarjeta) y facturación.
- WebSockets o push para estados de pedido y ubicación en tiempo real entre dispositivos.
- Google Maps con API key y rutas reales.
- Panel de comercios y de operaciones.
- Apps nativas iOS y Android tomando esta experiencia como referencia.

Los puntos de conexión están marcados en el código con `// FUTURE:` y concentrados en
`src/lib/services/`.

---

## Archivos clave

| Quiero cambiar… | Edito |
| --- | --- |
| Logo y símbolo en la app | `src/components/common/Logo.tsx` |
| Archivos de marca (SVG) | `public/brand/` (`suya-logo.svg`, `suya-logo-horizontal.svg`, `suya-icon.svg`, `iglesia-sullana.svg`, `rider.svg`) |
| Colores y tokens | `tailwind.config.js` y las variables CSS de `src/styles/index.css` |
| Tipografías | `src/styles/index.css` (paquetes `@fontsource/montserrat` e `@fontsource/inter`) |
| Negocios | `src/data/stores.json` |
| Productos | `src/data/products.json` |
| Categorías | `src/data/categories.json` |
| Promociones | `src/data/promotions.json` |
| Repartidores | `src/data/riders.json` |
| Historial demo de pedidos | `src/data/orders.json` |
| Ruta del seguimiento | `src/data/route.json` |
| Pantalla de carga | `src/components/common/SuyaIntroLoader.tsx`, `src/styles/intro-loader.css`, `src/assets/loader/sullana-scene.svg` |
| Mapas y proveedores | `src/components/map/` (`MapProvider.tsx`, `MockMap.tsx`, `LeafletMap.tsx`, `GoogleMapAdapter.tsx`) |
| Tiempos de la simulación | `src/lib/services/MockOrderService.ts` (`SIMULATION_STEPS`) |
| Claves de almacenamiento | `src/lib/storage.ts` |
| Imágenes reales | `public/images/README.md` explica dónde ponerlas |

### Cambiar el proveedor de mapa

Crea un archivo `.env.local` (ver `.env.example`):

```bash
VITE_MAP_PROVIDER=leaflet
```

- `mock` (predeterminado): SVG local, sin conexión ni API key.
- `leaflet`: OpenStreetMap, necesita internet.
- `google`: requiere además `VITE_GOOGLE_MAPS_KEY`; hoy el adaptador delega en el mapa local.

---

## Marcas y datos

Precios, horarios, promociones, calificaciones, productos, repartidores y direcciones son
**ficticios**. Los negocios con nombre real (KFC, Papa John's, Tottus, Inkafarma) se muestran con
tarjeta neutra e inicial: **no se recrean logotipos ajenos**. La silueta arquitectónica de Sullana
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
