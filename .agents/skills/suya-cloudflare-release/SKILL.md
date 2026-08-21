---
name: suya-cloudflare-release
description: Valida y publica las tres aplicaciones Suya en Cloudflare Pages cuando se prepara o ejecuta una entrega productiva.
---

# Release Suya en Cloudflare Pages

Usa `.github/workflows/cloudflare-pages.yml` como camino canónico. No publiques un build local ad hoc.

- Exige rama `main`, entorno GitHub `cloudflare-production` y tres proyectos Pages ya creados.
- Ejecuta `node scripts/check-cloudflare-config.mjs --deployment`, pruebas completas, `build:apps` y `verify:production` antes de cualquier carga.
- Detén la publicación si falta el proyecto Supabase exclusivo, una URL exacta, un proyecto Pages o el gate detecta mocks/secretos.
- Nunca imprimas claves. Vite solo recibe la publishable key; `service_role` queda fuera del frontend.
- Usa exactamente Wrangler `4.123.0`. Publica candidatos preview, prueba rutas profundas y recién entonces promueve backoffice, rider y customer.
- Si falla una promoción o smoke productivo, revierte automáticamente cada app cambiada a su snapshot anterior. La primera release exige habilitación explícita porque aún no existe rollback.
- Registra URLs y evidencia CI. Un fallo parcial no equivale a release.

Crear cuentas, proyectos, tokens, MFA o DNS requiere la sesión real del propietario; no los simules.
