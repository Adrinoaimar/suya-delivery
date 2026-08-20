# Estado de ejecución

Actualizado: 20 de agosto de 2026 (`America/Lima`)

## Objetivo

Convertir Suya Delivery en producto funcional multiapp. Ninguna simulación puede quedar activa en
producción.

## Estado actual

- Rama: `codex/functional-suya-loop`.
- Línea base verificada: typecheck, lint, 46 pruebas y build pasan.
- F0 verificado localmente: gobernanza, secretos, CI, arquitectura y continuidad.
- Backend elegido: Supabase exclusivo de Suya.
- Frontend objetivo: tres builds Cloudflare Pages: customer, rider y backoffice.

## Reglas de continuidad

- Git, pruebas y este archivo son estado canónico.
- Opus se reserva para arquitectura, RLS, pagos y seguridad. Sonnet máximo cubre revisión compleja;
  Kimi K3 usa razonamiento extra-high para implementación extensa.
- Si Claude agota una ventana, se crea checkpoint y continúa otro modelo. Claude retoma desde Git
  cuando vuelva a estar disponible.
- Un gate de cuenta, MFA, KYC, DNS o permiso de dispositivo no bloquea tareas independientes.

## Siguiente acción

Commit de F0. Luego iniciar contratos async con operaciones granulares, hidratación y manejo de
errores; no trasladar `save(Order[])` al backend.

## Gate productivo pendiente

El sitio GitHub Pages actual es legado no productivo. Se retirará cuando las tres aplicaciones
Cloudflare funcionen con Supabase y el verificador confirme ausencia de mocks en bundles.
