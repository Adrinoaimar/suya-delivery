# Estado de ejecución

Actualizado: 20 de agosto de 2026 (`America/Lima`)

## Objetivo

Convertir Suya Delivery en producto funcional multiapp. Ninguna simulación puede quedar activa en
producción.

## Estado actual

- Rama: `codex/functional-suya-loop`.
- Checkpoint F5 en cierre: catálogo Supabase, categorías reales y seed trazable de 58 productos de
  Andá Paya. F4 conserva 56 pruebas frontend y 40 pgTAP aprobadas en CI.
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

## Reglas de continuidad

- Git, pruebas y este archivo son estado canónico.
- Opus se reserva para arquitectura, RLS, pagos y seguridad. Sonnet máximo cubre revisión compleja;
  Kimi K3 usa razonamiento extra-high para implementación extensa.
- Si Claude agota una ventana, se crea checkpoint y continúa otro modelo. Claude retoma desde Git
  cuando vuelva a estar disponible.
- Un gate de cuenta, MFA, KYC, DNS o permiso de dispositivo no bloquea tareas independientes.

## Siguiente acción

Validar F5 en CI y conectar pedidos a una RPC transaccional Supabase con precios calculados en
servidor, estados multirol y Realtime.

## Gate productivo pendiente

El sitio GitHub Pages actual es legado no productivo. Se retirará cuando las tres aplicaciones
Cloudflare funcionen con Supabase y el verificador confirme ausencia de mocks en bundles.

La máquina actual no tiene Docker ni Podman. Las pruebas pgTAP y `db lint` se ejecutan en GitHub CI;
localmente se habilitarán cuando exista uno de esos runtimes.
