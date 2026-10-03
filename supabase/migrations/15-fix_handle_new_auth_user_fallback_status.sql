-- supabase/migrations/15-fix_handle_new_auth_user_fallback_status.sql
--
-- SPEC 13: fix del fallback status en `handle_new_auth_user`. Cuando el
-- signup NO tiene invitación válida (fallback al daycare seedeado), el
-- nuevo user debe quedar en `status='pending'` hasta que un staff/admin
-- lo apruebe.
--
-- Problema detectado en role-switch test post-fix (2026-10-02):
--   La migration 14 reorganizó la función con `coalesce` para defense
--   in depth, pero eliminó (accidentalmente) la asignación
--   `v_status := 'pending'` dentro del bloque de fallback. Resultado:
--   el `coalesce(v_status, 'active')` siempre devolvía 'active'.
--
-- Fix:
--   - Restablecer `v_status := 'pending'` dentro del bloque de fallback
--     (cuando `v_daycare_id` se asigna desde `v_default_daycare`, es
--     porque no había invitación válida → queda pendiente).
--   - `coalesce(v_status, 'active')` fuera del bloque sigue aplicando
--     como fallback final (e.g. si el daycare se borra).
--
-- Idempotente (CREATE OR REPLACE FUNCTION).

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta              jsonb;
  v_daycare_id        uuid;
  v_role              public.user_role;
  v_status            public.user_status;
  v_full_name         text;
  v_default_daycare   uuid;
begin
  v_meta := coalesce(new.raw_app_meta_data, '{}'::jsonb)
         || coalesce(new.raw_user_meta_data, '{}'::jsonb);

  v_daycare_id := nullif(v_meta ->> 'daycare_id', '')::uuid;
  v_role       := nullif(v_meta ->> 'role', '')::public.user_role;
  v_full_name  := nullif(v_meta ->> 'full_name', '');

  -- FALLBACK: signup sin invitación válida.
  -- Asignamos daycare seedeado + role='parent' + status='pending'.
  -- El padre queda pendiente hasta que un staff/admin lo apruebe.
  if v_daycare_id is null then
    select id into v_default_daycare from public.daycares limit 1;
    if v_default_daycare is not null then
      v_daycare_id := v_default_daycare;
      v_role       := 'parent';
      v_status     := 'pending';
    end if;
  end if;

  -- Defense in depth: si por algún motivo daycare_id/role siguen NULL
  -- (e.g. daycare borrado), usar defaults seguros para no romper el
  -- INSERT (NOT NULL en ambas).
  v_daycare_id := coalesce(v_daycare_id, v_default_daycare);
  v_role       := coalesce(v_role, 'parent'::public.user_role);
  v_status     := coalesce(v_status, 'active'::public.user_status);

  insert into public.users (id, daycare_id, role, status, full_name)
  values (new.id, v_daycare_id, v_role, v_status, coalesce(v_full_name, 'Pendiente'));

  return new;
end;
$$;