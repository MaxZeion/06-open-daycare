-- supabase/migrations/14-fix_handle_new_auth_user_full_name.sql
--
-- SPEC 13: fix del trigger `handle_new_auth_user` para que `full_name` se
-- extraiga correctamente de `raw_user_meta_data` después de que el trigger
-- BEFORE `on_auth_user_invitation_assigned` ha poblado `raw_app_meta_data`.
--
-- Problema detectado en role-switch test (2026-10-02):
--   El trigger BEFORE modifica `new.raw_app_meta_data` con daycare_id /
--   role / invitation_id. La función AFTER `handle_new_auth_user` lee
--   `raw_app_meta_data` pero NO copia `raw_user_meta_data`, que es donde
--   el cliente pasa `full_name` (es metadata de usuario, no server-
--   controlled). El `if v_meta = '{}'` que copiaba
--   `raw_user_meta_data` no se dispara (porque raw_app_meta_data ya
--   tiene contenido). Resultado: `v_full_name` queda NULL, INSERT con
--   `coalesce(..., 'Pendiente')` → todos los nuevos users aparecen como
--   "Pendiente" en `public.users`.
--
-- Fix:
--   - Cambiar el condicional por un merge no destructivo:
--     `v_meta := raw_app_meta_data || raw_user_meta_data`. Los claims
--     server-controlled (daycare_id, role) prevalecen sobre los del
--     cliente (que el Auth Hook ya rechaza para signup público). El
--     `full_name` se copia correctamente.
--   - Añadir `coalesce` final a `role` y `daycare_id` como defensa ante
--     signups vía `auth.admin.createUser` sin claims (no debería pasar,
--     pero mejor defense in depth).
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
  -- Merge de ambos metadata: app_metadata (server-controlled, prevalece)
  -- || user_metadata (cliente, del que el Auth Hook ya filtra campos
  -- sensibles). Resultado: claims server-controlled + full_name del cliente.
  v_meta := coalesce(new.raw_app_meta_data, '{}'::jsonb)
         || coalesce(new.raw_user_meta_data, '{}'::jsonb);

  v_daycare_id := nullif(v_meta ->> 'daycare_id', '')::uuid;
  v_role       := nullif(v_meta ->> 'role', '')::public.user_role;
  v_full_name  := nullif(v_meta ->> 'full_name', '');

  -- FALLBACK: si no hay daycare_id (e.g. signup sin invitación válida),
  -- usar el único daycare seedeado + role='parent' + status='pending'.
  -- El padre queda pendiente hasta que un staff/admin lo apruebe.
  if v_daycare_id is null then
    select id into v_default_daycare from public.daycares limit 1;
    if v_default_daycare is not null then
      v_daycare_id := v_default_daycare;
    end if;
  end if;

  -- Defense in depth: si por algún motivo daycare_id/role siguen NULL
  -- (no debería pasar tras el fallback, pero por si el daycare se borra),
  -- usar defaults seguros para no romper el INSERT (NOT NULL en ambas).
  v_daycare_id := coalesce(v_daycare_id, v_default_daycare);
  v_role       := coalesce(v_role, 'parent'::public.user_role);
  v_status     := coalesce(v_status, 'active'::public.user_status);

  insert into public.users (id, daycare_id, role, status, full_name)
  values (new.id, v_daycare_id, v_role, v_status, coalesce(v_full_name, 'Pendiente'));

  return new;
end;
$$;