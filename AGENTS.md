# AGENTS.md — Reglas para agentes que trabajen en Suya Delivery

Este proyecto es una demostración local de un marketplace de delivery de Sullana, Perú.
Antes de tocar código, lee el `README.md`. Las reglas de abajo son obligatorias.

## No cambiar

1. **Identidad visual.** El logotipo es «Suya / DELIVERY / SULLANA, PERÚ» con la S convertida en
   ruta, pin de ubicación y sol. No rediseñar la marca ni sustituir el símbolo.
2. **Colores.** Verde Suya `#0E6B44`, verde limón `#8CC63F`, amarillo sol `#FFC107`, marfil
   `#FAF7F1`, blanco `#FFFFFF`, carbón `#1F2023`, gris niebla `#E6E7E9`. Nada de degradados
   fuertes, neón, morados ni azul dominante. Sombras suaves
   (`box-shadow: 0 8px 30px rgba(31,32,35,0.08)`).
3. **Tipografía.** Solo Montserrat (600/700) para títulos, precios y botones importantes, e Inter
   (400/500/600) para el resto. No añadir familias.
4. **Stack.** React + TypeScript + Vite + Tailwind + React Router + Zustand + Lucide. No migrar a
   Next.js, no añadir Redux, no cambiar el gestor de estado.
5. **Sin backend.** Prohibido añadir Firebase, Supabase, Prisma, APIs propias, funciones
   serverless o cualquier servidor. Si una función lo necesita: crea la interfaz en
   `src/lib/services/types.ts` y una implementación mock local.

## Cómo trabajar

- **Mobile-first siempre.** Diseña a 360–430 px y luego amplía a 768/1024/1280/1440. En móvil la
  estructura cambia (mapa + bottom sheet + bottom nav), no es un escritorio encogido.
- **No dupliques componentes.** Antes de crear uno, busca en `src/components/common`,
  `marketplace`, `order`, `rider`, `safety`, `layout` y `map`.
- **localStorage solo desde `src/lib/storage.ts`.** Ningún componente accede directo.
- **Servicios desde `src/lib/services/index.ts`.** Las pantallas nunca importan una
  implementación concreta.
- **TypeScript estricto.** `strict: true`, sin `any`, sin `@ts-ignore`. Recuerda que
  `erasableSyntaxOnly` prohíbe `enum` y propiedades de parámetro en constructores.
- **Sin botones muertos.** Todo control visible navega, abre algo o cambia estado. Si algo aún no
  existe, muestra «Próximamente», pero prefiere un comportamiento demo real.
- **Accesibilidad.** `aria-label` en botones de solo ícono, foco visible, objetivo táctil mínimo
  44×44 px, textos de error en lenguaje claro (nunca mensajes técnicos).
- **Datos demo.** Marca claramente lo ficticio. No presentes precios, horarios ni promociones como
  información oficial de empresas reales, y no recrees logotipos de terceros.
- **Limitaciones visibles.** Lo que la demo simula (compartir ubicación, SOS, pagos) se declara en
  pantalla con el componente `DemoNotice`. No lo ocultes.

## Antes de dar por terminado un cambio

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run test
```

```bash
npm run build
```

Después revisa en el navegador: consola sin errores, sin scroll horizontal a 320 px y navegación
funcional en móvil y escritorio.

## Convenciones de idioma

- Interfaz, comentarios y documentación en **español**.
- Nombres de código (variables, componentes, archivos) en inglés, como el resto del proyecto.
- Moneda en soles con formato `S/ 19.90`; zona horaria America/Lima.
