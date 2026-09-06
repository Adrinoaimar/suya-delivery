# Estado de ejecución

Actualizado: 6 de septiembre de 2026 (`America/Lima`)

## Objetivo

Convertir Suya Delivery en producto funcional multiapp. Ninguna simulación puede quedar activa en
producción.

## Estado actual

- Rama de trabajo: `feat/suya-mobile-app`, basada en `origin/main`.
- F11 móvil: proyectos Capacitor Android/iOS, branding nativo, GPS con permiso explícito y build
  Android instalable de pruebas. El target iOS para simulador compiló correctamente en macOS CI.
- Checkpoint F7 verificado: puntos de entrega consentidos, mapas OSM, GPS real limitado, tracking
  participante, incidentes y SOS persistentes. CI aprobó 138 pgTAP; frontend aprobó 81 pruebas.
- F8A local: simulaciones productivas retiradas. Gate validó 352 artefactos sin mocks ni secretos.
- F0 verificado localmente: gobernanza, secretos, CI, arquitectura y continuidad.
- Contratos de catálogo y pedidos son asíncronos; las pantallas manejan carga, error y reintento.
- La progresión automática de pedidos y el pago digital simulado fueron retirados. El checkout solo
  acepta efectivo hasta integrar una pasarela real.
- Supabase CLI `2.115.0` y `supabase-js` `2.112.3` están fijados. El esquema inicial incluye RLS,
  aislamiento por restaurante, secretos fuera de `public`, auditoría, ubicaciones e incidencias.
- Backend elegido: Supabase exclusivo de Suya.
- Frontend objetivo: tres builds Cloudflare Pages: customer, rider y backoffice.
- Release Pages reproducible preparado: workflow manual desde `main`, Wrangler fijado, validación de
  cuenta/proyectos/URLs, identidad canónica, previews y rollback antes de publicar.
- Smoke browser multiapp quedó extraído como skill reusable en `.agents/skills/suya-browser-smoke`;
  cubre Chrome real, móvil/escritorio, rutas protegidas, accesibilidad básica y reduced motion.
- F9 cerró el último escape conocido: `build:apps` rechaza configuración incompleta y los bundles
  productivos rechazan chunks `Mock*`; GitHub Pages ya no publica artefactos heredados.
- F10 añadió runner Playwright y workflow CI para Supabase local; smoke Chrome local cubre nueve
  combinaciones de viewport/ruta. Backend E2E queda pendiente hasta evidencia CI verde.
- Cliente, repartidor y backoffice ya tienen entradas, rutas y bundles físicos independientes.
- Auth Supabase y guards por capacidad están implementados; la conexión rechaza un project ref
  distinto al exclusivo esperado para Suya.
- El catálogo Supabase no inventa horario, distancia ni reseñas. Andá Paya tiene 58 productos y
  `accepting_orders` habilitado por autorización comercial; bebidas sin precio no se importaron.
- Producción no incluye servicios mock, mapa falso, GPS simulado, promociones ficticias ni ganancias
  inventadas. Enlace público de tracking sigue deshabilitado por seguridad.

## Reglas de continuidad

- Git, pruebas y este archivo son estado canónico.
- Opus se reserva para arquitectura, RLS, pagos y seguridad. Sonnet máximo cubre revisión compleja;
  Kimi K3 usa razonamiento extra-high para implementación extensa.
- Si Claude agota una ventana, se crea checkpoint y continúa otro modelo. Claude retoma desde Git
  cuando vuelva a estar disponible.
- Un gate de cuenta, MFA, KYC, DNS o permiso de dispositivo no bloquea tareas independientes.

## Siguiente acción

Ejecutar el workflow macOS de iOS y el smoke del APK en un dispositivo Android. Para distribución,
crear firma Android de release y configurar Apple Developer Team, certificado y provisioning profile.

## Gate productivo pendiente

El sitio GitHub Pages actual es legado. Producción canónica usa `suya-customer.pages.dev`,
`suya-rider.pages.dev` y `suya-backoffice.pages.dev`; smoke remoto y verificador de bundles están verdes.

La máquina actual no tiene Docker ni Podman. Las pruebas pgTAP y `db lint` se ejecutan en GitHub CI;
localmente se habilitarán cuando exista uno de esos runtimes.

La máquina Windows no puede producir un `.ipa`. El proyecto Xcode y el build de simulador son
verificables en CI; un artefacto instalable exige firma Apple externa.




