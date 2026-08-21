# Handoff de producción — Suya Delivery

## Estado verificado

- PR de trabajo: `codex/functional-suya-loop`.
- CI E2E verde contra Supabase local real y Chromium real.
- El flujo cubierto es cliente → operaciones → repartidor → GPS/SOS/incidente → rechazo de código inválido → entrega válida.
- Skills reutilizables: `.agents/skills/suya-browser-smoke/` y `.agents/skills/suya-cloudflare-release/`.

## Estado Supabase

Proyecto dedicado `SUYA-DELYVERI`, ref `cggxooilzhqlcnofgtmi`, región `us-east-1`; migraciones,
lint y seed de Andá Paya aplicados. No reutilizar otros proyectos.

## Continuación obligatoria

1. Crear `suya-customer`, `suya-rider` y `suya-backoffice` en Cloudflare Pages.
2. Configurar el environment protegido `cloudflare-production` según `.github/workflows/cloudflare-pages.yml`.
3. Ejecutar el workflow manual con `allow_initial_release=true` solo después de validar los proyectos.
4. Probar las tres URLs públicas y registrar sus enlaces; no declarar producción antes de ese smoke.

Nunca colocar `service_role`, claves de pago ni secretos en Vite/Pages. Los pagos digitales siguen
bloqueados hasta integrar un proveedor real con credenciales del comercio; efectivo es el único
método productivo actualmente habilitado.
