# Estado de ejecución

Actualizado: 20 de agosto de 2026 (`America/Lima`)

## Objetivo

Convertir Suya Delivery en producto funcional multiapp. Ninguna simulación puede quedar activa en
producción.

## Estado actual

- Rama: `codex/functional-suya-loop`.
- Checkpoint F6A verificado: pedidos cash transaccionales, precios de servidor, idempotencia,
  códigos privados y adaptador Supabase. CI aprobó 76 pruebas frontend, tres builds y 72 pgTAP.
- F0 verificado localmente: gobernanza, secretos, CI, arquitectura y continuidad.
- Contratos de catálogo y pedidos son asíncronos; las pantallas manejan carga, error y reintento.
- La progresión automática de pedidos y el pago digital simulado fueron retirados. El checkout solo
  acepta efectivo hasta integrar una pasarela real.
- Supabase CLI `2.115.0` y `supabase-js` `2.112.3` están fijados. El esquema inicial incluye RLS,
  aislamiento por restaurante, secretos fuera de `public`, auditoría, ubicaciones e incidencias.
- Backend elegido: Supabase exclusivo de Suya.
- Frontend objetivo: tres builds Cloudflare Pages: customer, rider y backoffice.
- Cliente, repartidor y backoffice ya tienen entradas, rutas y bundles físicos independientes.
- Auth Supabase y guards por capacidad están implementados; la conexión rechaza un project ref
  distinto al exclusivo esperado para Suya.
- El catálogo Supabase no inventa horario, distancia ni reseñas. `accepting_orders` permanece falso
  para Andá Paya hasta definir logística real; bebidas sin precio no se importaron.
- Producción ya no incluye `MockStoreService` ni `MockOrderService`. Siguen pendientes mocks de
  mapas, seguridad y datos secundarios antes del gate productivo.

## Reglas de continuidad

- Git, pruebas y este archivo son estado canónico.
- Opus se reserva para arquitectura, RLS, pagos y seguridad. Sonnet máximo cubre revisión compleja;
  Kimi K3 usa razonamiento extra-high para implementación extensa.
- Si Claude agota una ventana, se crea checkpoint y continúa otro modelo. Claude retoma desde Git
  cuando vuelva a estar disponible.
- Un gate de cuenta, MFA, KYC, DNS o permiso de dispositivo no bloquea tareas independientes.

## Siguiente acción

Completar despacho y estados multirol mediante RPC estrictas, Realtime y notificaciones.

## Gate productivo pendiente

El sitio GitHub Pages actual es legado no productivo. Se retirará cuando las tres aplicaciones
Cloudflare funcionen con Supabase y el verificador confirme ausencia de mocks en bundles.

La máquina actual no tiene Docker ni Podman. Las pruebas pgTAP y `db lint` se ejecutan en GitHub CI;
localmente se habilitarán cuando exista uno de esos runtimes.
