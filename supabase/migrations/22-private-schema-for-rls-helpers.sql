-- supabase/migrations/22-private-schema-for-rls-helpers.sql
--
-- SPEC 22: mover los 6 helpers SECURITY DEFINER internos a un schema
-- `private` que PostgREST no expone, cerrando 8 de los 14 advisories
-- `security_definer_function_executable` (baseline: 4 anon + 10
-- authenticated). Despues de esta migracion quedan 6 advisories (2 anon +
-- 4 authenticated), todos documentados como expuestos por diseño.
--
-- Funciones que se mueven a `private` (solo invocadas desde policies o
-- triggers, nunca desde la app via RPC):
--   - is_parent_of(uuid)              → policies (SPEC 11/20)
--   - post_visible_to_parent(uuid)    → policy posts SELECT (SPEC 20)
--   - daycare_of_child(uuid)          → policies children/parent_children/
--                                        invitations/daily_summaries (SPEC 11/20)
--   - daycare_of_post(uuid)           → policies posts/post_children/
--                                        post_photos (SPEC 16/20)
--   - assign_role_from_invitation()   → trigger on_auth_user_invitation_
--                                        assigned en auth.users (SPEC 13)
--   - rls_auto_enable()               → event trigger ensure_rls (creado por
--                                        la plataforma, ddl_command_end con
--                                        tags CREATE TABLE / CREATE TABLE AS /
--                                        SELECT INTO)
--
-- Funciones que SE QUEDAN en `public` expuestas por diseño (invocadas por la
-- app o por anon via PostgREST RPC; ver Decisiones del SPEC 22):
--   - validate_invitation(text)  → anon, /activate pre-login (app/activate/actions.ts)
--   - expire_invitation(uuid)    → anon, /activate tras detectar expiracion
--   - get_feed_for_parent(uuid, uuid) → authenticated, utils/supabase/posts.ts
--   - email_exists(text)         → authenticated, app/(staff)/kids/actions.ts
-- Se documentan con `comment on function` al final del archivo.
--
-- Mecanica: `drop function ... cascade` elimina en cascada las 15 policies y
-- los 2 triggers que referencian los helpers (verificado via pg_depend: no
-- hay views ni dependencias de extensiones). Todo se recrea con prefijo
-- explicito `private.X` dentro de esta misma transaccion (RLS default-deny
-- cubre la ventana intermedia). `daycare_of_room` no se mueve: no aparece
-- en los advisories y su policy (children_insert) no se toca.

-- ========================================================================
-- SCHEMA private: visible para postgres (owner) y authenticated (policies);
-- invisible para PostgREST (solo expone `public` por defecto).
-- ========================================================================

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ========================================================================
-- DROP de los 6 helpers en public (cascade: lleva las policies/triggers,
-- que se recrean mas abajo con private.X).
-- ========================================================================

drop function if exists public.is_parent_of(uuid) cascade;
drop function if exists public.post_visible_to_parent(uuid) cascade;
drop function if exists public.daycare_of_child(uuid) cascade;
drop function if exists public.daycare_of_post(uuid) cascade;
drop function if exists public.assign_role_from_invitation() cascade;
drop function if exists public.rls_auto_enable() cascade;

-- ========================================================================
-- RE-CREATE de los helpers en private. Cuerpos identicos a su version viva
-- en la DB (pg_get_functiondef), misma signature. Grants: revoke de public
-- y anon; EXECUTE a authenticated + service_role (paridad con los ACLs
-- previos; service_role lo necesitan los triggers de auth y las policies
-- resueltas por el owner).
-- ========================================================================

-- is_parent_of: ¿el invocante es padre del nino? (bypass RLS parent_children)
create or replace function private.is_parent_of(p_child_id uuid)
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

revoke execute on function private.is_parent_of(uuid) from public, anon;
grant  execute on function private.is_parent_of(uuid) to authenticated, service_role;

-- post_visible_to_parent: post general (sin niños dirigidos) o con uno de
-- SUS niños. Corta el ciclo posts ↔ post_children (bypass RLS via owner).
create or replace function private.post_visible_to_parent(p_post_id uuid)
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

revoke execute on function private.post_visible_to_parent(uuid) from public, anon;
grant  execute on function private.post_visible_to_parent(uuid) to authenticated, service_role;

-- daycare_of_child: ¿a que daycare pertenece el nino? children.room_id →
-- rooms.daycare_id. NULL si el nino aun no tiene sala.
create or replace function private.daycare_of_child(p_child_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select r.daycare_id
    from public.children c
    join public.rooms r on r.id = c.room_id
   where c.id = p_child_id;
$$;

revoke execute on function private.daycare_of_child(uuid) from public, anon;
grant  execute on function private.daycare_of_child(uuid) to authenticated, service_role;

-- daycare_of_post: ¿a que daycare pertenece el post? posts.author_id →
-- users.daycare_id.
create or replace function private.daycare_of_post(p_post_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select u.daycare_id
    from public.posts p
    join public.users  u on u.id = p.author_id
   where p.id = p_post_id;
$$;

revoke execute on function private.daycare_of_post(uuid) from public, anon;
grant  execute on function private.daycare_of_post(uuid) to authenticated, service_role;

-- assign_role_from_invitation: BEFORE INSERT en auth.users. Enriquece
-- raw_app_meta_data (daycare_id/role/invitation_id) si hay invitación
-- pending valida para el email. Invocado SOLO por el trigger; nunca RPC.
create or replace function private.assign_role_from_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation  record;
  v_daycare_id  uuid;
begin
  -- Busca invitación pending + no expirada para el email del nuevo user.
  -- SECURITY DEFINER: bypassea RLS de invitations (postgres owner) para que
  -- la lectura no se filtre por el rol activo. Sin el role-switch previo
  -- al trigger, no podemos invocar `auth.uid()` aquí.
  select i.id, i.child_id
    into v_invitation
    from public.invitations i
   where lower(i.email) = lower(new.email)
     and i.status = 'pending'
     and i.expires_at > now()
   order by i.created_at desc
   limit 1;

  if v_invitation.id is not null then
    -- Resuelve daycare_id via child → room → daycare.
    select r.daycare_id
      into v_daycare_id
      from public.children c
      join public.rooms r on r.id = c.room_id
     where c.id = v_invitation.child_id;

    if v_daycare_id is not null then
      -- Sobre NEW (BEFORE INSERT): modifica raw_app_meta_data antes del
      -- INSERT. El siguiente trigger AFTER (handle_new_auth_user) lo leerá
      -- con daycare_id + role ya asignados.
      new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
                            || jsonb_build_object(
                                 'daycare_id',  v_daycare_id,
                                 'role',        'parent',
                                 'invitation_id', v_invitation.id
                               );
    end if;
  end if;

  return new;
exception when others then
  -- No abortamos el INSERT si la búsqueda falla; el fallback de
  -- handle_new_auth_user asigna daycare_id/role por defecto.
  raise warning 'assign_role_from_invitation failed for new user %: %',
    new.id, sqlerrm;
  return new;
end;
$$;

revoke execute on function private.assign_role_from_invitation() from public, anon;
grant  execute on function private.assign_role_from_invitation() to authenticated, service_role;

-- rls_auto_enable: event trigger (ddl_command_end) que fuerza RLS en tablas
-- recien creadas en public. Definicion literal de la version viva en la DB.
create or replace function private.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = 'pg_catalog'
as $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

revoke execute on function private.rls_auto_enable() from public, anon;
grant  execute on function private.rls_auto_enable() to authenticated, service_role;

-- ========================================================================
-- RECREATE de las 15 policies afectadas (dropeadas en cascada arriba),
-- ahora con prefijo explicito private.X (no fiarse del search_path).
-- Semantica identica a la version viva; `to authenticated` y permissivo.
-- ========================================================================

-- ---- CHILDREN (SPEC 11) ----

drop policy if exists children_update_staff_same_daycare on public.children;

create policy children_update_staff_same_daycare
  on public.children for update
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

drop policy if exists children_delete_staff_same_daycare on public.children;

create policy children_delete_staff_same_daycare
  on public.children for delete
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ---- PARENT_CHILDREN (SPEC 11) ----

drop policy if exists parent_children_select_self_or_staff_same_daycare on public.parent_children;

create policy parent_children_select_self_or_staff_same_daycare
  on public.parent_children for select
  to authenticated
  using (
    parent_id = (select auth.uid())
    or
    (
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      and private.daycare_of_child(child_id)::text
            = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    )
  );

drop policy if exists parent_children_insert_staff_same_daycare on public.parent_children;

create policy parent_children_insert_staff_same_daycare
  on public.parent_children for insert
  to authenticated
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

drop policy if exists parent_children_update_staff_same_daycare on public.parent_children;

create policy parent_children_update_staff_same_daycare
  on public.parent_children for update
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

drop policy if exists parent_children_delete_staff_same_daycare on public.parent_children;

create policy parent_children_delete_staff_same_daycare
  on public.parent_children for delete
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ---- INVITATIONS (SPEC 11) ----

drop policy if exists invitations_select_inviter_or_staff_same_daycare on public.invitations;

create policy invitations_select_inviter_or_staff_same_daycare
  on public.invitations for select
  to authenticated
  using (
    invited_by = (select auth.uid())
    or
    (
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      and private.daycare_of_child(child_id)::text
            = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    )
  );

drop policy if exists invitations_insert_staff_same_daycare on public.invitations;

create policy invitations_insert_staff_same_daycare
  on public.invitations for insert
  to authenticated
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

drop policy if exists invitations_update_staff_same_daycare on public.invitations;

create policy invitations_update_staff_same_daycare
  on public.invitations for update
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

drop policy if exists invitations_delete_staff_same_daycare on public.invitations;

create policy invitations_delete_staff_same_daycare
  on public.invitations for delete
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and private.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ---- DAILY_SUMMARIES (SPEC 20) ----

drop policy if exists daily_summaries_select_own_children on public.daily_summaries;

create policy daily_summaries_select_own_children
  on public.daily_summaries for select
  to authenticated
  using (
    -- Padre: tiene vínculo con el niño (inline EXISTS, sin recursar la
    -- policy de parent_children sobre children).
    exists (
      select 1 from public.parent_children pc
      where pc.child_id = daily_summaries.child_id
        and pc.parent_id = (select auth.uid())
    )
    or
    -- Staff/admin: el nino pertenece a su daycare (helper bypass RLS).
    (
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      and private.daycare_of_child(child_id)::text
            = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    )
  );

drop policy if exists daily_summaries_modify_staff_same_daycare on public.daily_summaries;

create policy daily_summaries_modify_staff_same_daycare
  on public.daily_summaries for all
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
    and private.daycare_of_child(child_id)::text
          = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
    and private.daycare_of_child(child_id)::text
          = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ---- POSTS / POST_CHILDREN / POST_PHOTOS (SPEC 16/20) ----

drop policy if exists posts_select_parent_or_staff_same_daycare on public.posts;

create policy posts_select_parent_or_staff_same_daycare
  on public.posts for select
  to authenticated
  using (
    private.daycare_of_post(id)::text
      = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    and (
      -- staff/admin: todo el feed del daycare.
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      or
      -- parent: anuncio general o post que incluye a uno de SUS niños.
      private.post_visible_to_parent(id)
    )
  );

drop policy if exists post_children_select_parent_or_staff_same_daycare on public.post_children;

create policy post_children_select_parent_or_staff_same_daycare
  on public.post_children for select
  to authenticated
  using (
    private.daycare_of_post(post_id)::text
      = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    and (
      -- staff/admin: todas las filas del daycare.
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      or
      -- parent: solo filas de SUS niños.
      private.is_parent_of(child_id)
    )
  );

-- post_photos_select_same_daycare: dropeada en cascada por daycare_of_post.
-- Se recrea tal cual estaba (SPEC 16); solo cambia la referencia del helper.
drop policy if exists post_photos_select_same_daycare on public.post_photos;

create policy post_photos_select_same_daycare
  on public.post_photos for select
  to authenticated
  using (
    private.daycare_of_post(post_id)::text
      = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ========================================================================
-- RECREATE de triggers (dropeados en cascada arriba), apuntando a private.X.
-- ========================================================================

drop trigger if exists on_auth_user_invitation_assigned on auth.users;
create trigger on_auth_user_invitation_assigned
  before insert on auth.users
  for each row execute function private.assign_role_from_invitation();

-- ensure_rls: event trigger creado originalmente por la plataforma
-- (ddl_command_end, tags CREATE TABLE / CREATE TABLE AS / SELECT INTO).
-- Verificado: evtenabled = 'O' (origin enabled).
drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.rls_auto_enable();

-- ========================================================================
-- DOCUMENTACION de las 4 funciones que se quedan en public por diseno
-- (invocadas por la app o por anon via PostgREST RPC). Cubren los 6
-- advisories restantes tras esta migracion.
-- ========================================================================

comment on function public.validate_invitation(text) is
  'Exposed by design: called by anon from /activate pre-login (app/activate/actions.ts).';

comment on function public.expire_invitation(uuid) is
  'Exposed by design: called by anon from /activate after detecting an expired invitation.';

comment on function public.get_feed_for_parent(uuid, uuid) is
  'Exposed by design: filtered feed RPC for role=parent, called by the app (utils/supabase/posts.ts).';

comment on function public.email_exists(text) is
  'Exposed by design: called by authenticated staff when inviting a parent (app/(staff)/kids/actions.ts).';
