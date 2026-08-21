# Handoff de producción — Suya Delivery

## Estado verificado

- PR de trabajo: `codex/functional-suya-loop`.
- CI E2E verde contra Supabase local real y Chromium real.
- El flujo cubierto es cliente → operaciones → repartidor → GPS/SOS/incidente → rechazo de código inválido → entrega válida.
- Skills reutilizables: `.agents/skills/suya-browser-smoke/` y `.agents/skills/suya-cloudflare-release/`.

## Estado Supabase

Proyecto dedicado `SUYA-DELYVERI`, ref `cggxooilzhqlcnofgtmi`, región `us-east-1`; migraciones,
lint y seed de Andá Paya aplicados. No reutilizar otros proyectos.

## Despliegue verificado

- `https://suya-customer.pages.dev` — customer.
- `https://suya-rider.pages.dev` — rider.
- `https://suya-backoffice.pages.dev` — backoffice.
- Despliegues direct-upload verificados con Wrangler desde commit `7909b10`.
- Smoke remoto Chrome: nueve combinaciones viewport/ruta, HTTP 200, headings correctos, sin errores de página.

## Automatización pendiente

Configurar environment protegido `cloudflare-production` y token Cloudflare dedicado de mínimo privilegio
para que `.github/workflows/cloudflare-pages.yml` publique automáticamente. Despliegue manual ya está activo.

Nunca colocar `service_role`, claves de pago ni secretos en Vite/Pages. Los pagos digitales siguen
bloqueados hasta integrar un proveedor real con credenciales del comercio; efectivo es el único
método productivo actualmente habilitado.
