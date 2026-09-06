# Rediseño Liquid Glass

Vinculado a [DESIGN.md](./DESIGN.md). Every screen must read as the same product if placed side by side.

## Alcance

Actualizar el sistema visual compartido de cliente, repartidor y backoffice sin cambiar contratos, rutas, permisos ni estado. El vidrio comunica jerarquía; no se aplica como decoración indiscriminada.

## Flujos y estados

### Cliente

Entrada por `/`, búsqueda, selección de negocio, carrito y checkout. Cabecera y navegación inferior usan Suya Lens. Catálogo usa tarjetas claras con imagen dominante. Loading conserva shimmer tenue; error conserva acción de reintento; vacío muestra una sola acción útil; offline mantiene contenido disponible y explica límites.

### Repartidor

Entrada por `/rider`, disponibilidad, viaje y seguridad. Fondo oscuro verde carbón, navegación translúcida. Disponibilidad conserva texto y estado además del color. Viaje activo es el único foco. Error de ubicación permanece visible; sesión expirada retorna a `/rider/login`.

### Backoffice

Entrada por `/backoffice`, resumen, pedidos, mesas, catálogo y ofertas. Sidebar oscuro translúcido en escritorio; banda horizontal compacta en móvil. Tablas y formularios usan superficie elevada casi opaca para legibilidad. Sesión expirada retorna a `/backoffice/login`; permisos insuficientes conservan página dedicada.

## Componentes

### Suya Lens

- Variantes: `light`, `dark`, `nav`, `feature`.
- Visual: transparencia, blur máximo 20px, saturación moderada, hairline y brillo interior.
- Fallback: superficie opaca cuando `backdrop-filter` no existe.
- No anidar Lens dentro de Lens.
- Sin movimiento continuo. Entrada opcional de 280ms solo al cargar una vista.

### Card

- `default`: surface 88%, borde hairline, sombra baja.
- `glass`: solo promos o resumen, surface 72%, Suya Lens.
- Hover escritorio: elevación de 2px; móvil: feedback de escala 0.985.
- Contenido largo envuelve; imagen mantiene relación y alt existente.

### Button

- Primario accent sólido; secundario surface elevado; ghost transparente; danger semántico.
- Altura mínima 48px. Foco visible de 3px. Disabled no depende solo de opacidad.
- Sin gradiente, brillo animado ni bounce.

### Field

- Fondo elevado 82%, borde visible, label persistente, error enlazado con `aria-describedby`.
- Focus usa accent y halo de bajo contraste; autocomplete conserva color de texto.

### Navegación

- Cliente móvil: cuatro destinos; cápsula activa dentro de barra flotante Suya Lens.
- Cabecera: ubicación como acción principal, iconos con objetivos 48px.
- Rider: tres destinos primarios más menú; activos con forma y texto.
- Backoffice: navegación completa, scroll horizontal móvil y sidebar escritorio.

## Responsive y accesibilidad

- 360px: una columna, márgenes 16px, sin scroll horizontal excepto rails declarados.
- 768px: grids de dos columnas cuando contenido lo permite.
- 1024px: header/sidebar de escritorio y contenido máximo 1280px.
- Contrastes y fuentes siguen DESIGN.md. Textos sobre vidrio reciben superficie de respaldo.
- Focus completo por teclado. Iconos decorativos mantienen `aria-hidden`.
- Motion motivado; `prefers-reduced-motion` obligatorio.

## Pre-Flight

- Identidad: valores fuera del sistema 0 en componentes tocados; una familia de radios, Lucide, una acción accent.
- Anti-slop: sin púrpura, gradient text, mesh hero, nested cards, glow neón ni vidrio indiscriminado.
- Estados: loading, vacío, error, permisos y sesión conservados.
- Accesibilidad: contrastes documentados, foco visible, touch 48px, safe areas y reduced motion.
- Layout: portada asimétrica, rails horizontales, grids operativos y listas con divisores.
- Carga cognitiva: una acción primaria por región; navegación cliente limitada a cuatro destinos.
- Autoevaluación: distintividad 3, jerarquía 4, consistencia 4, accesibilidad 4, estados 3, copy 3, restraint 4, motion 4. Total 29/32.
- Revisión aplicada: vidrio limitado a jerarquía alta para mantener legibilidad y evitar estética genérica.

## Handoff de implementación

- Agente: `react-vite-tailwind-engineer`.
- Sistema: componentes React existentes; alinear interacción con convenciones Radix sin recrear widgets complejos ni añadir un sistema paralelo.
- Archivos principales: `tailwind.config.js`, `src/styles/index.css`, componentes comunes, headers y layouts.
- Aceptación: cliente, rider y backoffice comparten tokens; navegación y formularios funcionan a 360/768/1440px; no cambian rutas ni datos; typecheck, lint, Vitest, builds y smoke navegador pasan.
- Instrucción: Implement exactly this spec. Theme the design system with our locked tokens; do NOT redesign or re-implement its components.
