-- supabase/migrations/20-rpc_get_feed_for_parent.sql
--
-- SPEC 20: RPC que encapsula el filtrado del feed de un padre. Devuelve los
-- ids de `posts` visibles para (p_parent_id, p_daycare_id):
--   - post del mismo daycare (vía users del autor, misma fuente que la
--     policy: daycare_of_post), Y
--   - sin post_children (anuncio / "toda la sala") O con al menos un niño
--     vinculado al padre en parent_children.
--
-- KEEP IN SYNC con la policy posts_select_parent_or_staff_same_daycare
-- (migration 20-harden_posts_rls_for_parents) — defense in depth: si
-- alguien rompe la policy, el RPC sigue filtrando; y viceversa.
--
-- Adaptaciones sobre el SQL del spec:
--   - `set search_path = ''` + nombres fully-qualified (patrón del repo
--     desde 10-fix_set_updated_at_search_path) en lugar de
--     `set search_path = public, pg_temp`: evita search-path injection.
--   - Guard `p_parent_id = (select auth.uid())`: un padre no puede pedir el
--     set de IDs de OTRO padre (info-leak de UUIDs vía enumeración). El
--     caller de la app pasa currentUser.userId, que coincide con auth.uid().

create or replace function public.get_feed_for_parent(
  p_parent_id uuid,
  p_daycare_id uuid
)
returns table (id uuid)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id
    from public.posts p
    join public.users u on u.id = p.author_id
   where u.daycare_id = p_daycare_id
     and p_parent_id = (select auth.uid())
     and (
       not exists (
         select 1 from public.post_children pc
         where pc.post_id = p.id
       )
       or exists (
         select 1
           from public.post_children pc
           join public.parent_children pch on pch.child_id = pc.child_id
          where pc.post_id = p.id
            and pch.parent_id = get_feed_for_parent.p_parent_id
       )
     );
$$;

revoke execute on function public.get_feed_for_parent(uuid, uuid)
  from public, anon;
grant execute on function public.get_feed_for_parent(uuid, uuid)
  to authenticated;
