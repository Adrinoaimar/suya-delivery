# AGENTS.md — Reglas para agentes que trabajen en Suya Delivery

Este proyecto es un marketplace de delivery funcional para Sullana, Perú.
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
5. **Backend autorizado y acotado.** Usar Supabase para Auth, Postgres, RLS, Realtime, Storage y
   funciones seguras. Todo acceso pasa por contratos compartidos; ninguna pantalla importa el
   cliente Supabase ni una implementación concreta. Migraciones versionadas, RLS `default deny`
   y proyecto exclusivo de Suya son obligatorios.
6. **Nada simulado en producción.** Mocks, datos ficticios, `localStorage` como base, timers de
   estados, pagos falsos, mapas falsos y sincronización entre pestañas solo pueden existir en
   pruebas o desarrollo local mediante flags explícitos. El build productivo debe fallar si activa
   un proveedor mock.

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
- **Datos comerciales.** Publica únicamente datos autorizados y con procedencia registrada. Campos
  ambiguos o no confirmados permanecen no vendibles; nunca inventes precios, horarios o contactos.
- **Migración sin engaño.** Mientras una función real aún no esté conectada, debe quedar fuera del
  build productivo o mostrarse como no disponible. Nunca presentes una simulación como función real.

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

También verifica que el build productivo no incluya proveedores mock, `DEMO DATA`, `FUTURE:` sin
resolver ni credenciales en bundle, sourcemaps, logs o historial Git.

## Convenciones de idioma

- Interfaz, comentarios y documentación en **español**.
- Nombres de código (variables, componentes, archivos) en inglés, como el resto del proyecto.
- Moneda en soles con formato `S/ 19.90`; zona horaria America/Lima.
