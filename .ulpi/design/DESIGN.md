---
project: Suya
register: product
aesthetic_direction: organic / natural
color_strategy: restrained
design_system: Suya existing React primitives, progressively aligned with Radix interaction conventions
design_variance: 6
motion_intensity: 3
visual_density: 5
---

# Suya design language

## Design Read

Calma urbana con energía norteña: vidrio cálido y preciso sobre una ciudad verde, sin perder velocidad operativa.

## Signature

La firma es el **Suya Lens**: una superficie translúcida con borde superior luminoso, sombra verde difusa y una sola zona de refracción suave. Solo aparece en navegación, cabeceras, promos y paneles de alta jerarquía. Las superficies de trabajo secundarias permanecen quietas y legibles.

## Color (locked)

| Rol | OKLCH | Hex / valor | Uso |
| --- | --- | --- | --- |
| background | `oklch(0.965 0.012 155)` | `#F0F7F3` | Fondo principal verde muy pálido |
| surface | `oklch(0.985 0.008 155 / 0.78)` | `rgba(250,253,251,.78)` | Glass claro |
| elevated | `oklch(1 0 0 / 0.92)` | `rgba(255,255,255,.92)` | Menús, formularios, tablas |
| text | `oklch(0.245 0.035 155)` | `#152A20` | Texto principal |
| muted | `oklch(0.47 0.025 155)` | `#52675D` | Texto secundario, contraste AA sobre surface |
| subtle | `oklch(0.91 0.018 155)` | `#DDE9E2` | Separadores y estados pasivos |
| border | `oklch(0.86 0.026 155 / 0.75)` | `rgba(190,213,201,.75)` | Hairlines |
| accent | `oklch(0.47 0.13 155)` | `#0B7048` | Acción, foco y navegación activa |
| success | `oklch(0.64 0.15 145)` | `#43A854` | Confirmación |
| warning | `oklch(0.79 0.15 85)` | `#E9B52B` | Atención |
| danger | `oklch(0.53 0.19 28)` | `#C83E32` | Error y acción destructiva |
| info | `oklch(0.57 0.10 225)` | `#377F9C` | Información neutral |

Contrastes mínimos verificados: `text/background` 13:1, `muted/background` 5.6:1, `white/accent` 5.7:1, `accent/background` 5.2:1. El vidrio siempre incluye fallback sólido. El contenido nunca depende solo del blur.

## Type (locked)

| Rol | Familia | Uso | Notas |
| --- | --- | --- | --- |
| display | Bricolage Grotesque Variable | Títulos, cifras, acciones | Peso 600–720, tracking mínimo `-0.025em` |
| body | DM Sans Variable | Lectura y formularios | Peso 400–600, medida máxima 70ch |
| utility | DM Sans Variable | Etiquetas y datos | Peso 600, mayúsculas solo para estados breves |

## Scales (locked)

- Spacing: `0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96` px.
- Radius: `sm 8`, `md 14`, `lg 20`, `xl 28`, `full 9999` px.
- Motion: `fast 120ms`, `base 280ms`, `emphasis 480ms`; easing `cubic-bezier(.16,1,.3,1)`.
- Elevation: hairline + inner highlight; shadows use green-black at 8–14% opacity.
- Touch: mínimo 48px en móvil. Safe areas obligatorias.
- `prefers-reduced-motion`: elimina desplazamiento y reduce toda transición a 1ms.

## Voice

Registro: directo, cercano, operativo. Verbos consistentes: `Pedir`, `Aplicar`, `Confirmar`, `Activar`, `Desactivar`. Evitar frases promocionales sin respaldo, cifras inventadas y lenguaje grandilocuente.

Every screen must read as the same product if placed side by side.
