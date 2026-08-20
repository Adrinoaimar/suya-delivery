---
name: suya-browser-smoke
description: Verifica las tres aplicaciones Suya Delivery en navegador real, viewports críticos y rutas protegidas antes de un release.
---

# Smoke browser Suya

Usa builds independientes (`customer`, `rider`, `backoffice`) servidos localmente o URLs de
preview reales. Nunca sustituyas backend, mapas, GPS, autenticación o pagos con fixtures para
declarar producción lista.

- Prueba como mínimo móvil 390×844 y escritorio 1440×900; añade tablet cuando cambie layout.
- Comprueba HTTP exitoso, título principal esperado, ruta final, ausencia de `pageerror`, overflow
  horizontal y nombre accesible en botones, enlaces e inputs.
- Verifica rutas protegidas: sin sesión deben terminar en `/login`, no mostrar datos privados ni
  permitir acciones de rol.
- Repite con `prefers-reduced-motion`; registra cualquier diferencia funcional, no solo visual.
- Para offline/reconexión, carga primero una pantalla real, corta red, confirma estado de error y
  reintento, restaura red y confirma recuperación. No conviertas un fallback en éxito falso.
- Guarda solo evidencia sanitizada: URL, viewport, estado HTTP, ruta, errores y resultado. No
  guardes cookies, tokens, coordenadas privadas ni capturas con PII.
- Si falla, conserva reproducción mínima y corrige antes de promover. El smoke no reemplaza E2E
  multirol contra Supabase ni pruebas de carga.

