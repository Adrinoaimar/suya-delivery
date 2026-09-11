# Imágenes de Suya Delivery

Esta carpeta guarda las fotografías reales del proyecto. Mientras no existan, la aplicación
dibuja tarjetas neutras con la inicial del negocio (`src/components/common/Thumb.tsx`) y los
placeholders de `public/placeholders/`.

## Dónde colocar cada imagen

| Carpeta sugerida | Uso | Tamaño recomendado |
| --- | --- | --- |
| `public/images/stores/` | Portada de cada negocio | 1200 × 720 px (5:3), JPG/WebP |
| `public/images/stores/logos/` | Logo del negocio | 256 × 256 px, PNG/SVG con fondo transparente |
| `public/images/products/` | Foto de producto | 800 × 800 px (1:1), JPG/WebP |
| `public/images/riders/` | Foto del repartidor | 320 × 320 px (1:1) |
| `public/images/promos/` | Arte de promociones | 1200 × 600 px (2:1) |

## Cómo enlazarlas

1. Copia el archivo en la carpeta correspondiente.
2. Edita el JSON del dato en `src/data/`:
   - Negocios: `src/data/stores.json` → campos `image` y `logo`.
   - Productos: `src/data/products.json` → campo `image`.
   - Repartidores: `src/data/riders.json` → campo `photo`.
   - Promociones: `src/data/promotions.json` → campo `image`.
3. La ruta se escribe desde la raíz pública, por ejemplo:
   `"image": "/images/stores/el-buen-sabor.webp"`.
4. Si el archivo no existe o falla la carga, la interfaz vuelve automáticamente al placeholder.

## Marcas reales

Las fichas locales ya tienen un activo resoluble para la tarjeta y el menú. KFC, Papa John's,
Tottus e Inkafarma usan los activos públicos oficiales documentados en
`public/brand/stores/CREDITS.md`. Las fichas locales sin un maestro recibido usan una marca
tipográfica de catálogo claramente identificada como reemplazable; no se presenta como logo
oficial. Las cuatro marcas incorporadas en Supabase conservan su procedencia comercial en
`docs/data/brand-assets.md`.
