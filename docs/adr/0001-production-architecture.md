# ADR 0001: arquitectura productiva

Fecha: 20 de agosto de 2026 (`America/Lima`)

## Estado

Aceptada.

## Contexto

La aplicación actual valida experiencia, pero catálogo, pedidos, pagos, identidad y ubicación se
resuelven dentro del navegador. Esto no permite operación real entre clientes, comercios,
repartidores y equipo de Suya.

## Decisión

- Mantener React, TypeScript, Vite, Tailwind, React Router y Zustand.
- Separar cliente, repartidor y backoffice en builds web independientes dentro de un monorepo.
- Usar un proyecto Supabase exclusivo para Suya Delivery: Auth, Postgres, RLS, Realtime, Storage y
  funciones seguras.
- Mantener contratos compartidos entre UI y acceso a datos. Las pantallas no conocen proveedores.
- Usar Cloudflare Pages para los tres frontends.
- Usar Leaflet y OpenStreetMap durante el piloto, respetando atribución y política de tiles.
- Aceptar efectivo como método real inicial. Cualquier pago digital usa checkout/tokenización de un
  proveedor y confirmación por webhook; Suya nunca almacena tarjetas.

## Invariantes

- RLS `default deny` y pruebas de aislamiento por rol/tienda.
- Dinero en céntimos; totales recalculados en servidor.
- Ninguna clave secreta en frontend, repositorio, checkpoint o logs.
- Ningún proveedor mock ni dato ficticio en builds productivos.
- Cambios incompletos quedan tras flags de desarrollo y no se publican como funcionales.
- Estados de pedido son idempotentes, auditables y validados en servidor.

## Consecuencias

Los contratos síncronos deberán migrar a async. Los datos JSON quedarán únicamente como entrada de
migración o fixtures de prueba. GitHub Pages permanecerá temporalmente hasta que los tres proyectos
Cloudflare pasen paridad y rollback.
