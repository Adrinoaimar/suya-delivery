# Suya Menús backend

Base backend production-ready, sin datos de prueba.

1. Crear proyecto Supabase. Ejecutar `supabase/migrations/001_suya_menus.sql`.
2. Crear bucket privado `menu-images` (o definir `SUPABASE_MENU_BUCKET`).
3. Configurar Netlify variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (solo Functions).
4. Instalar `@supabase/supabase-js` en aplicación raíz.

Functions:

- `menu-public?slug=...`: menú publicado, solo platos disponibles.
- `admin-catalog?table=...`: CRUD protegido por RLS usando JWT Supabase.
- `upload-url`: URL firmada para subir imágenes; valida dueño de tienda.

Autenticación email/password, recuperación y verificación de correo se configuran en Supabase Auth; frontend debe usar `signUp`, `signInWithPassword`, `resetPasswordForEmail` y escuchar `onAuthStateChange`.
