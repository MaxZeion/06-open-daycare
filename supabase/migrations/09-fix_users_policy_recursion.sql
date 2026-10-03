-- supabase/migrations/09-fix_users_policy_recursion.sql
--
-- Fix de la policy `users_select_self_or_same_daycare_staff` introducida en
-- la migration 08. Esa policy hacía un subquery sobre `public.users` desde
-- dentro de una policy sobre `public.users`, lo que Postgres detecta como
-- infinite recursion (error 42P17) y rechaza CUALQUIER SELECT/UPDATE/DELETE
-- sobre la tabla para el rol `authenticated`. La app queda completamente
-- rota hasta que se reemplace la policy.
--
-- Causa raíz: una policy de una tabla no puede leer la misma tabla en su
-- predicado USING. Postgres evalúa la policy fila a fila, y para evaluar
-- el predicado necesita leer la tabla, lo que requiere la policy, lo que
-- requiere leer la tabla → ciclo.
--
-- Solución: leer `role` + `daycare_id` desde `auth.jwt() -> 'app_metadata'`,
-- que la migration 03 (`03-propagate_app_meta_data_on_signup.sql`) ya
-- propaga en `handle_new_auth_user`, y la migration 04 valida con
-- provider/providers. `auth.jwt()` no es una tabla: vive en el JWT del
-- request y por naturaleza bypass RLS → no recursiona.
--
-- Trade-off conocido: si en el futuro se cambia `role` o `daycare_id`
-- en `auth.users`/`public.users`, el JWT tardará un refresh en reflejarlo
-- (los claims no son frescos hasta el próximo `getClaims()`). En
-- OpenDayCare role y daycare_id se fijan en signup y no hay flujo que
-- los modifique → aceptable. Cuando se introduzca cambio de role,
-- invalidar la sesión activa del usuario (`auth.admin.signOut`) o
-- aceptar la latencia hasta el refresh.
--
-- Verificado en role-switch contra los 2 users reales del DB (staff
-- Alberto + parent Alberto Sánchez, mismo daycare Soles):
--   - parent ve 1 fila (la suya).
--   - staff ve 2 filas (toda su daycare).
--   - anon ve 0 filas.

drop policy if exists users_select_self_or_same_daycare_staff on public.users;

create policy users_select_self_or_same_daycare_staff
  on public.users for select
  to authenticated
  using (
    -- El propio user siempre ve su fila.
    id = (select auth.uid())
    or
    -- Staff/admin ven todas las filas de su mismo daycare.
    -- Lee role + daycare_id del JWT (NO de public.users → evita recursión).
    -- Patrón (select …) para single-evaluation por query, no por fila.
    (
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      and
      daycare_id::text = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    )
  );