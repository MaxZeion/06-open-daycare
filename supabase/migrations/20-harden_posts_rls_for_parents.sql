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
-- Adaptación sobre el SQL del spec: `posts` no tiene columna `daycare_id`;
-- el daycare del post se resuelve con el helper SECURITY DEFINER
-- `daycare_of_post()` (migration 16), que evita recursar contra la policy
-- de public.users. Las policies corren como owner sobre las tablas que
-- referencian → los EXISTS a post_children/parent_children no aplican RLS
-- de esas tablas (sin recursión).
--
-- KEEP IN SYNC con el RPC public.get_feed_for_parent (migration
-- 20-rpc_get_feed_for_parent): misma regla de filtrado, defense in depth.
--
-- Roles helper: se usa `(select auth.jwt() ...)` single-eval y
-- `(select auth.uid())`, mismo patrón que migrations 11/16.
--
-- NO se tocan: posts_insert_staff, posts_modify_author,
-- post_children_modify_author, post_photos_* (solo cambia el SELECT).

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
      -- parent: anuncio general (sin niños dirigidos)…
      not exists (
        select 1 from public.post_children pc
        where pc.post_id = posts.id
      )
      or
      -- …o post que incluye a uno de SUS niños.
      exists (
        select 1
          from public.post_children pc
          join public.parent_children pch on pch.child_id = pc.child_id
         where pc.post_id = posts.id
           and pch.parent_id = (select auth.uid())
      )
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
      exists (
        select 1 from public.parent_children pch
        where pch.child_id = post_children.child_id
          and pch.parent_id = (select auth.uid())
      )
    )
  );
