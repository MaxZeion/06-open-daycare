-- supabase/migrations/12-fix_children_returning_secdef_quirk.sql
--
-- Fix del quirk de Postgres en `children` con RETURNING + SECURITY DEFINER.
--
-- Diagnóstico (probado en role-switch contra el DB real):
--   - INSERT INTO children ... RETURNING id falla con
--     "new row violates row-level security policy" cuando la policy de
--     SELECT sobre la fila recién creada invoca a `daycare_of_child(id)`,
--     porque la función SECURITY DEFINER hace `SELECT FROM children WHERE
--     id = p_child_id` y Postgres evalúa la policy de children sobre
--     esa subquery en el contexto de RETURNING. La fila recién creada no
--     es "durable para sí misma" en ese instante y la subquery SECURITY
--     DEFINER no encuentra la fila → `daycare_of_child` retorna NULL →
--     la policy falla.
--   - El INSERT sin RETURNING SÍ funciona (la fila se inserta; un SELECT
--     posterior la ve). El fallo es solo en RETURNING.
--   - `parent_children` e `invitations` NO se ven afectadas porque sus
--     SECURITY DEFINER functions leen OTRAS tablas (children vía FK
--     estable), no la misma tabla donde se hace el INSERT.
--
-- Solución:
--   - Reescribir las policies de children (SELECT + INSERT) para que
--     NO invoquen SECURITY DEFINER functions sobre la misma tabla.
--     Usar `EXISTS` directo contra rooms (y parent_children para el
--     caso del padre).
--   - Drop las 2 SECUIDER functions de la 11 que han quedado huérfanas
--     (`is_parent_of`, `daycare_of_room`). `daycare_of_child` se mantiene
--     porque la siguen usando las policies de children UPDATE/DELETE y
--     todas las de parent_children/invitations.
--
-- Beneficio colateral: 2 SECUIDER menos en `public` (bajan los
-- warnings del linter `authenticated_security_definer_function_executable`).

-- ========================================================================
-- 1) Nueva SELECT policy de children sin SECUIDER
-- ========================================================================

drop policy if exists children_select_parent_or_staff_same_daycare on public.children;

create policy children_select_parent_or_staff_same_daycare
  on public.children for select
  to authenticated
  using (
    -- Padre: existe vínculo en parent_children. EXISTS dispara la policy
    -- de parent_children, pero esa policy no hace subqueries a children
    -- → no hay recursión.
    exists (
      select 1 from public.parent_children pc
       where pc.child_id = public.children.id
         and pc.parent_id = (select auth.uid())
    )
    or
    -- Staff/admin: el niño pertenece a su daycare (via rooms, no
    -- via children → evita el quirk de RETURNING).
    (
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      and exists (
        select 1 from public.rooms r
         where r.id = public.children.room_id
           and r.daycare_id::text = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
      )
    )
  );

-- ========================================================================
-- 2) Nueva INSERT policy de children sin daycare_of_room (SECUIDER)
-- ========================================================================

drop policy if exists children_insert_staff_same_daycare on public.children;

create policy children_insert_staff_same_daycare
  on public.children for insert
  to authenticated
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and exists (
      select 1 from public.rooms r
       where r.id = room_id
         and r.daycare_id::text = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    )
  );

-- ========================================================================
-- 3) Drop SOLO las SECUIDER functions que han quedado huérfanas
-- ========================================================================
-- `daycare_of_child` SE MANTIENE: la siguen usando las policies de
-- children UPDATE/DELETE y TODAS las de parent_children/invitations
-- (no tienen el quirk porque su `daycare_of_child(child_id)` lee la FK
-- child_id que apunta a una fila YA EXISTENTE en children, no a la misma
-- tabla del INSERT/UPDATE/DELETE).
-- `is_parent_of` y `daycare_of_room` ya no se usan en ninguna policy
-- (la nueva SELECT de children usa EXISTS sobre parent_children; la nueva
-- INSERT de children usa EXISTS sobre rooms). Se dropean.

drop function if exists public.is_parent_of(uuid);
drop function if exists public.daycare_of_room(uuid);