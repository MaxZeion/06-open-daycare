-- supabase/migrations/20-harden_posts_rls_for_parents.sql
--
-- SPEC 20: endurece SELECT en `posts` y `post_children` para role='parent'.
-- Hasta hoy (migration 16) cualquier autenticado del mismo daycare leía
-- TODOS los posts; un padre con acceso SQL directo (devtools + publishable
-- key) podía listar posts de niños ajenos.
--
-- Nuevas policies con branching por rol desde el JWT app_metadata:
--   - staff/admin: ven todo el daycare (comportamiento actual intacto →
--     regresión del feed staff cubierta por el spec).
--   - parent: solo posts SIN post_children (anuncios / "toda la sala") o
--     cuyos niños tienen vínculo con él en parent_children.
--
-- Adaptaciones sobre el SQL del spec:
--   1. `posts` no tiene columna `daycare_id`; el daycare del post se
--      resuelve con el helper SECURITY DEFINER `daycare_of_post()`
--      (migration 16), que evita recursar contra la policy de public.users.
--   2. Los EXISTS inline sobre post_children/parent_children del spec
--      causaron "infinite recursion detected in policy for relation
--      posts": las subqueries dentro de una policy corren con RLS como el
--      usuario invocante, y `post_children_modify_author` (FOR ALL → aplica
--      también a SELECT) lee `posts` → ciclo posts ↔ post_children.
--      Fix: helpers SECURITY DEFINER (bypass RLS vía rol owner postgres con
--      BYPASSRLS), mismo patrón de bypass documentado en Risks del spec.
--      `is_parent_of(uuid)` revive aquí con el diseño original de la
--      cabecera de migration 11.
--
-- KEEP IN SYNC con el RPC public.get_feed_for_parent (migration
-- 20-rpc_get_feed_for_parent): misma regla de filtrado, defense in depth.
--
-- NO se tocan: posts_insert_staff, posts_modify_author,
-- post_children_modify_author, post_photos_* (solo cambia el SELECT).

-- ========================================================================
-- HELPERS SECURITY DEFINER (bypass RLS, sin recursión)
-- ========================================================================

-- is_parent_of: ¿el invocante es padre del niño? auth.uid() lee el claim
-- de request.jwt.claims → funciona dentro de un SECURITY DEFINER.
create or replace function public.is_parent_of(p_child_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.parent_children
    where child_id = p_child_id
      and parent_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_parent_of(uuid) from public, anon;
grant  execute on function public.is_parent_of(uuid) to authenticated;

-- post_visible_to_parent: post general (sin niños dirigidos) o con uno de
-- SUS niños. Evalúa post_children/parent_children como owner (bypass RLS)
-- → corta el ciclo posts ↔ post_children.
create or replace function public.post_visible_to_parent(p_post_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select not exists (
           select 1 from public.post_children
           where post_id = p_post_id
         )
     or exists (
           select 1
             from public.post_children pc
             join public.parent_children pch on pch.child_id = pc.child_id
            where pc.post_id = p_post_id
              and pch.parent_id = (select auth.uid())
         );
$$;

revoke execute on function public.post_visible_to_parent(uuid) from public, anon;
grant  execute on function public.post_visible_to_parent(uuid) to authenticated;

-- ========================================================================
-- POSTS: reemplaza posts_select_same_daycare
-- ========================================================================

drop policy if exists posts_select_same_daycare on public.posts;
drop policy if exists posts_select_parent_or_staff_same_daycare on public.posts;

create policy posts_select_parent_or_staff_same_daycare
  on public.posts for select
  to authenticated
  using (
    public.daycare_of_post(id)::text
      = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    and (
      -- staff/admin: todo el feed del daycare.
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      or
      -- parent: anuncio general o post que incluye a uno de SUS niños.
      public.post_visible_to_parent(id)
    )
  );

-- ========================================================================
-- POST_CHILDREN: reemplaza post_children_select_same_daycare
-- ========================================================================

drop policy if exists post_children_select_same_daycare on public.post_children;
drop policy if exists post_children_select_parent_or_staff_same_daycare on public.post_children;

create policy post_children_select_parent_or_staff_same_daycare
  on public.post_children for select
  to authenticated
  using (
    public.daycare_of_post(post_id)::text
      = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    and (
      -- staff/admin: todas las filas del daycare.
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      or
      -- parent: solo filas de SUS niños.
      public.is_parent_of(child_id)
    )
  );
