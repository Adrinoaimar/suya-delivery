---
name: suya-production-preflight
description: Audita las precondiciones reales de despliegue de Suya Delivery antes de tocar Supabase o Cloudflare Pages.
---

# Preflight de producción Suya

Usa esta skill cuando se vaya a publicar Suya o cuando otra IA retome el proyecto. Su objetivo es
separar bloqueos de cuenta/infraestructura de fallos del código y producir evidencia reutilizable.

## Orden de auditoría

1. Lee `config/production.json`, `.github/workflows/cloudflare-pages.yml`,
   `docs/production-handoff.md` y `docs/payments-integration.md`.
2. Comprueba la organización Supabase y lista sus proyectos. No pauses, borres, reutilices ni
   migres un proyecto que no esté identificado como exclusivo de Suya.
3. Exige un `supabaseProjectRef` real y exclusivo antes de aplicar migraciones. Si la cuota gratuita
   impide crear el proyecto, detén solo el despliegue y documenta la cuota; continúa con tests y
   revisión de código que no requieran producción.
4. Comprueba que existan exactamente `suya-customer`, `suya-rider` y `suya-backoffice` en la cuenta
   Cloudflare autorizada. No inventes URLs `pages.dev`.
5. Verifica que el environment `cloudflare-production` tenga URL Supabase, publishable key,
   project ref, URLs exactas, account ID y token. Nunca expongas `service_role` ni secretos de pago.
6. Ejecuta los gates del workflow y el smoke E2E real antes de recomendar promoción. Un build local
   o una página estática no demuestra producción.

## Salida requerida

Devuelve una tabla breve de `verificado`, `faltante` y `bloqueado`, con evidencia por archivo,
servicio o URL. Si la precondición externa cambia, retoma el handoff y ejecuta la secuencia de
`docs/production-handoff.md`; no sustituyas Supabase por mocks ni habilites pagos digitales sin
webhook autenticado.

