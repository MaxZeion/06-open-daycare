-- supabase/migrations/21-harden-posts-modify-author.sql
--
-- SPEC 21: cierra la fuga detectada por el db-security-audit 20 (finding C1).
-- `posts_modify_author` (creada en migration 16) era `FOR ALL` con USING/WITH
-- CHECK = `author_id = (select auth.uid())` SIN filtro por rol. Al ser
-- permissive, se OR-eaba con `posts_insert_staff` y dejaba INSERT/UPDATE/
-- DELETE a un `role='parent'` que se pusiera a sí mismo como author_id.
--
-- Fix mínimo: añadir `(select auth.jwt() -> 'app_metadata' ->> 'role') =
-- 'staff'` a USING y WITH CHECK. Mismo patrón textual que
-- `post_children_modify_author` y `post_photos_modify_author` (que ya tenían
-- este filtro — verificado por verificación live durante la auditoría).
--
-- NO se tocan:
--   - `post_children_modify_author` / `post_photos_modify_author` (ya correctas).
--   - `posts_select_parent_or_staff_same_daycare` (READ only, introducida en SPEC 20).
--   - `posts_insert_staff` (es redundante con `posts_modify_author` cuando el rol
--     es 'staff', pero la dejamos por simetría con SPEC 16).
--   - ninguna otra policy FOR ALL del proyecto (`daily_summaries_modify_*`,
--     `children_*_staff_same_daycare`, etc.) — todas tienen el filtro de rol
--     explícito y han sido auditadas.

-- ========================================================================
-- POSTS: reemplaza posts_modify_author con filtro role='staff'
-- ========================================================================

drop policy if exists posts_modify_author on public.posts;

create policy posts_modify_author
  on public.posts for all
  to authenticated
  using (
    author_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
  )
  with check (
    author_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
  );