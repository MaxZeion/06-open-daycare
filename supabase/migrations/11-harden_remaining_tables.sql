-- supabase/migrations/11-harden_remaining_tables.sql
--
-- Endurecimiento de children, parent_children, invitations, daycares, rooms
-- tras el cierre de users (migrations 08/09/10). Estas 5 tablas seguían con
-- `using (true)` y `force row level security = false`, fugas equivalentes
-- a la que se cerró en users pero en otras superficies.
--
-- Resuelve (todos críticos):
--   - daycares/rooms: cualquier padre autenticado leía TODAS las guarderías
--     y salas del DB → enumeración cross-tenant.
--   - children: cualquier padre autenticado leía TODOS los niños de TODAS
--     las guarderías + INSERT/UPDATE/DELETE sobre niños ajenos
--     (privilege escalation confirmado por role-switch test: el padre
--     "Alberto Sánchez" pudo insertar "Niño Hackeado" en Soles).
--   - parent_children: cualquier padre leía TODAS las relaciones
--     parent ↔ child (incluido de otras familias) → enumeración.
--   - invitations: cualquier padre leía TODAS las invitaciones con sus
--     emails y podía crear/aceptar/cancelar invitaciones ajenas.
--   - force_rls off en las 5 tablas (defensa en profundidad).
--   - Grants demasiado generosos (mismo patrón que users).
--
-- Patrón:
--   - Helpers SECUIDER en public con auth.uid()/proclaims que prueban
--     pertenencia y daycare_id::text. SECUIDER + revoke from PUBLIC/anon +
--     auth.uid() interno evita recursión con las policies de las tablas que
--     leen, y mantiene el patrón de "single source of truth" recomendado
--     por las best practices de Supabase Postgres.
--   - SELECT: cada user ve su propia fila (vínculo padre↔hijo en parent_children)
--     O todo su daycare (staff/admin del mismo daycare según JWT app_metadata).
--   - INSERT/UPDATE/DELETE: solo staff/admin del mismo daycare.
--   - auth.uid() envuelto en (select auth.uid()) para single-eval por query.
--   - auth.jwt() -> 'app_metadata' para role + daycare_id (no recursiona).
--   - Se añade updated_at + trigger set_updated_at en las 3 tablas que
--     pueden recibir UPDATE (children, parent_children, invitations).

-- ========================================================================
-- HELPER FUNCTIONS: SECUIDER + auth.uid() check interno + revoke PUBLIC
-- ========================================================================

-- is_parent_of: ¿el usuario autenticado es padre del niño dado?
-- Bypass RLS sobre parent_children (postgres owner) para que las policies
-- de children/parent_children no se recursiven entre sí.
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
      and parent_id = auth.uid()
  );
$$;

revoke execute on function public.is_parent_of(uuid) from public, anon;
grant execute on function public.is_parent_of(uuid) to authenticated;

-- daycare_of_child: ¿a qué daycare pertenece el niño? Via children.room_id
-- → rooms.daycare_id. Si el niño no tiene room (recién nacido sin sala
-- asignada), retorna NULL — la policy de staff NO verá ese niño hasta que
-- se le asigne sala. Trade-off documentado; aceptable mientras la app
-- siempre asigne room antes de exponer el niño al padre.
create or replace function public.daycare_of_child(p_child_id uuid)
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

revoke execute on function public.daycare_of_child(uuid) from public, anon;
grant execute on function public.daycare_of_child(uuid) to authenticated;

-- daycare_of_room: ¿a qué daycare pertenece la sala?
create or replace function public.daycare_of_room(p_room_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select daycare_id from public.rooms where id = p_room_id;
$$;

revoke execute on function public.daycare_of_room(uuid) from public, anon;
grant execute on function public.daycare_of_room(uuid) to authenticated;

-- ========================================================================
-- updated_at + trigger set_updated_at en las 3 tablas actualizables
-- ========================================================================

alter table public.children
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists children_set_updated_at on public.children;
create trigger children_set_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();

alter table public.parent_children
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists parent_children_set_updated_at on public.parent_children;
create trigger parent_children_set_updated_at
  before update on public.parent_children
  for each row execute function public.set_updated_at();

alter table public.invitations
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists invitations_set_updated_at on public.invitations;
create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

-- ========================================================================
-- FORCE ROW LEVEL SECURITY en las 5 tablas (defensa en profundidad)
-- ========================================================================

alter table public.daycares        force row level security;
alter table public.rooms           force row level security;
alter table public.children        force row level security;
alter table public.parent_children force row level security;
alter table public.invitations     force row level security;

-- ========================================================================
-- DAYCARES: solo user ve su propia daycare (vía JWT app_metadata.daycare_id)
-- ========================================================================

drop policy if exists daycares_select_authenticated on public.daycares;

create policy daycares_select_same_daycare
  on public.daycares for select
  to authenticated
  using (
    id::text = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ========================================================================
-- ROOMS: solo user ve rooms de su daycare
-- ========================================================================

drop policy if exists rooms_select_authenticated on public.rooms;

create policy rooms_select_same_daycare
  on public.rooms for select
  to authenticated
  using (
    daycare_id::text = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ========================================================================
-- CHILDREN: padre ve sus hijos + staff/admin ve toda su daycare
-- ========================================================================

drop policy if exists children_select_authenticated on public.children;
drop policy if exists children_insert_authenticated on public.children;
drop policy if exists children_update_authenticated on public.children;
drop policy if exists children_delete_authenticated on public.children;

create policy children_select_parent_or_staff_same_daycare
  on public.children for select
  to authenticated
  using (
    -- Padre: tiene vínculo en parent_children (helper bypass RLS).
    public.is_parent_of(id)
    or
    -- Staff/admin: niño pertenece a su daycare (helper bypass RLS).
    (
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      and public.daycare_of_child(id)::text
            = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    )
  );

create policy children_insert_staff_same_daycare
  on public.children for insert
  to authenticated
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_room(room_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

create policy children_update_staff_same_daycare
  on public.children for update
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

create policy children_delete_staff_same_daycare
  on public.children for delete
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ========================================================================
-- PARENT_CHILDREN: padre ve sus propias relaciones + staff ve toda su daycare
-- ========================================================================

drop policy if exists parent_children_select_authenticated on public.parent_children;
drop policy if exists parent_children_insert_authenticated on public.parent_children;
drop policy if exists parent_children_update_authenticated on public.parent_children;
drop policy if exists parent_children_delete_authenticated on public.parent_children;

create policy parent_children_select_self_or_staff_same_daycare
  on public.parent_children for select
  to authenticated
  using (
    parent_id = (select auth.uid())
    or
    (
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      and public.daycare_of_child(child_id)::text
            = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    )
  );

create policy parent_children_insert_staff_same_daycare
  on public.parent_children for insert
  to authenticated
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

create policy parent_children_update_staff_same_daycare
  on public.parent_children for update
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

create policy parent_children_delete_staff_same_daycare
  on public.parent_children for delete
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ========================================================================
-- INVITATIONS: invited_by ve sus invitaciones + staff ve toda su daycare
-- ========================================================================

drop policy if exists invitations_select_authenticated on public.invitations;
drop policy if exists invitations_insert_authenticated on public.invitations;
drop policy if exists invitations_update_authenticated on public.invitations;
drop policy if exists invitations_delete_authenticated on public.invitations;

create policy invitations_select_inviter_or_staff_same_daycare
  on public.invitations for select
  to authenticated
  using (
    invited_by = (select auth.uid())
    or
    (
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      and public.daycare_of_child(child_id)::text
            = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    )
  );

create policy invitations_insert_staff_same_daycare
  on public.invitations for insert
  to authenticated
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

create policy invitations_update_staff_same_daycare
  on public.invitations for update
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

create policy invitations_delete_staff_same_daycare
  on public.invitations for delete
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
    and public.daycare_of_child(child_id)::text
        = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ========================================================================
-- GRANTS: anon no toca nada; authenticated solo lo que la policy permite
-- ========================================================================

-- anon: cero grants en las 5 tablas. Sus únicas vías son las SECUIDER
-- documentadas (validate_invitation, expire_invitation).
revoke all on table public.daycares        from anon;
revoke all on table public.rooms           from anon;
revoke all on table public.children        from anon;
revoke all on table public.parent_children from anon;
revoke all on table public.invitations     from anon;

-- authenticated: SELECT en las 5 (las policies acotan por fila). INSERT/
-- UPDATE/DELETE solo donde hay policy explícita arriba (children,
-- parent_children, invitations); en daycares y rooms no hay policies de
-- escritura, así que se revocan los grants correspondientes.
revoke insert, update, delete, trigger, references, truncate
  on table public.daycares from authenticated;

revoke insert, update, delete, trigger, references, truncate
  on table public.rooms from authenticated;

-- children: SELECT + INSERT + UPDATE + DELETE grants mantenidos (las policy
-- restrictivas acotan por fila). trigger/references/truncate se revocan.
revoke trigger, references, truncate on table public.children from authenticated;

-- parent_children: SELECT + INSERT + UPDATE + DELETE grants mantenidos.
revoke trigger, references, truncate on table public.parent_children from authenticated;

-- invitations: SELECT + INSERT + UPDATE + DELETE grants mantenidos.
revoke trigger, references, truncate on table public.invitations from authenticated;

-- service_role conserva todos los grants (server-side, bypass RLS).