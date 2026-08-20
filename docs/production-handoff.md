# Handoff de producción — Suya Delivery

## Estado verificado

- PR de trabajo: `codex/functional-suya-loop`.
- CI E2E verde contra Supabase local real y Chromium real.
- El flujo cubierto es cliente → operaciones → repartidor → GPS/SOS/incidente → rechazo de código inválido → entrega válida.
- Skills reutilizables: `.agents/skills/suya-browser-smoke/` y `.agents/skills/suya-cloudflare-release/`.

## Bloqueador externo

La cuenta Supabase `ueqhnbizzrthgfdvpnio` tiene dos proyectos gratuitos activos y rechazó crear
`suya-delivery-production` por límite de cuota. No reutilizar ni pausar `orbe-integration-staging`
ni `Adrinoaimar's Project`: son proyectos ajenos a Suya.

## Continuación obligatoria

1. Crear un proyecto Supabase exclusivo en `sa-east-1` y guardar su ref en `config/production.json`.
2. Aplicar las migraciones versionadas y ejecutar los tests SQL/advisors.
3. Crear `suya-customer`, `suya-rider` y `suya-backoffice` en Cloudflare Pages.
4. Configurar el environment protegido `cloudflare-production` según `.github/workflows/cloudflare-pages.yml`.
5. Ejecutar el workflow manual con `allow_initial_release=true` solo después de validar los proyectos.
6. Probar las tres URLs públicas y registrar sus enlaces; no declarar producción antes de ese smoke.

Nunca colocar `service_role`, claves de pago ni secretos en Vite/Pages. Los pagos digitales siguen
bloqueados hasta integrar un proveedor real con credenciales del comercio; efectivo es el único
método productivo actualmente habilitado.

