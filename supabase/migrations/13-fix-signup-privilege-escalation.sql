-- supabase/migrations/13-fix-signup-privilege-escalation.sql
--
-- SPEC 13: cerrar el vector de privilege escalation en signup público.
--
-- Resuelve el derivado D3 del informe `db-security-audit users --apply`
-- (2026-10-02): el trigger `handle_new_auth_user` (creado en migration 02,
-- propagado en 03) lee `new.raw_user_meta_data ->> 'daycare_id'` y
-- `->> 'role'` para crear el row en `public.users`. Esos campos vienen
-- del cliente y son user-editable, así que cualquier signup público podía
-- auto-asignarse `role='admin'` del daycare que quisiera.
--
-- SPEC 13 cierra el vector en 3 piezas (este archivo cubre SQL):
--   1. Auth Hook `before_user_created` (Edge Function, separado en
--      `supabase/functions/before_user_created/`): rechaza el signup si
--      trae `role`/`daycare_id` en metadata, o si no trae
--      `invitation_code`. Desplegado por separado (Step 8 del plan).
--   2. Trigger BEFORE INSERT `on_auth_user_invitation_assigned` en
--      `auth.users` (esta migration): busca una invitación pending para
--      el email del nuevo user y, si la encuentra, sobreescribe
--      `raw_app_meta_data` con `daycare_id` + `role='parent'` +
--      `invitation_id` antes de que la fila se persista.
--   3. Trigger AFTER INSERT `on_auth_user_created` (esta migration,
-- versión): `handle_new_auth_user` actualizado con fallback al único
--      daycare seedeado cuando el signup llega sin invitación válida.
--
-- Orden de ejecución (importante):
--   BEFORE INSERT trigger BEFORE INSERT trigger AFTER INSERT trigger
-- `assign_role_from_invitation` se ejecuta como BEFORE — modifica
-- `NEW.raw_app_meta_data` antes del INSERT. `handle_new_auth_user`
-- corre como AFTER — lee `NEW.raw_app_meta_data` (ya poblado por el
-- trigger anterior) y crea el row en `public.users`. Si los dos fueran
-- AFTER, Postgres los ejecutaría en orden alfabético por nombre y
-- `on_auth_user_created` correría primero, leyendo un
-- `raw_app_meta_data` aún vacío.
--
-- Trade-off documentado: el fallback "daycare seedeado + role='parent' +
-- status='pending'" aplica cuando el signup no tiene invitación válida.
-- Aceptable mientras solo hay 1 daycare; cuando haya multi-daycare, una
-- spec aparte endurecerá el fallback (probablemente rechaza el signup).

-- ========================================================================
-- 1) assign_role_from_invitation: BEFORE INSERT en auth.users
-- ========================================================================

create or replace function public.assign_role_from_invitation()
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
    -- Resuelve daycare_id vía child → room → daycare.
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

-- Trigger BEFORE INSERT (corre ANTES que handle_new_auth_user).
drop trigger if exists on_auth_user_invitation_assigned on auth.users;
create trigger on_auth_user_invitation_assigned
  before insert on auth.users
  for each row execute function public.assign_role_from_invitation();

-- ========================================================================
-- 2) handle_new_auth_user: versión con fallback para daycare seedeado
-- ========================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta              jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_daycare_id        uuid;
  v_role              public.user_role;
  v_status            public.user_status;
  v_full_name         text;
  v_default_daycare   uuid;
begin
  -- Si app_metadata está vacío y viene user_metadata (signups legacy
  -- previos al Auth Hook o signups vía admin.createUser), copiar.
  -- El Auth Hook actual rechaza signups que traigan daycare_id/role en
  -- user_metadata, pero signups pre-hook pueden tenerlos ahí.
  if v_meta = '{}'::jsonb and new.raw_user_meta_data is not null then
    v_meta := new.raw_user_meta_data;
  end if;

  v_daycare_id := (v_meta ->> 'daycare_id')::uuid;
  v_role       := nullif(v_meta ->> 'role', '')::public.user_role;
  v_full_name  := nullif(v_meta ->> 'full_name', '');

  -- FALLBACK: si no hay daycare_id/role (e.g. signup sin invitación
  -- válida), usar el único daycare seedeado + role='parent' + status='pending'.
  -- El padre queda pendiente hasta que un staff/admin lo apruebe.
  if v_daycare_id is null then
    select id into v_default_daycare from public.daycares limit 1;
    if v_default_daycare is not null then
      v_daycare_id := v_default_daycare;
      v_role       := 'parent';
      v_status     := 'pending';
    end if;
  end if;

  if v_status is null then
    v_status := 'active';
  end if;

  insert into public.users (id, daycare_id, role, status, full_name)
  values (new.id, v_daycare_id, v_role, v_status, coalesce(v_full_name, 'Pendiente'));

  return new;
end;
$$;

-- Trigger AFTER INSERT (lee NEW.raw_app_meta_data ya poblado por el trigger
-- BEFORE anterior si había invitación).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();