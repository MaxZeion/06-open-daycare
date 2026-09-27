-- 1. Backfill: copiar los campos de raw_user_meta_data a raw_app_meta_data
--    del staff seed para que ya estén disponibles en getClaims().
update auth.users
   set raw_app_meta_data = jsonb_build_object(
     'daycare_id', raw_user_meta_data -> 'daycare_id',
     'role',       raw_user_meta_data -> 'role',
     'full_name',  raw_user_meta_data -> 'full_name'
   )
 where email = 'staff@opendaycare.com';

-- 2. Trigger actualizado: ahora también propaga a raw_app_meta_data
--    para que sign-ups futuros tengan los claims desde el primer JWT.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.users (id, daycare_id, role, status, full_name)
  values (
    new.id,
    (v_meta ->> 'daycare_id')::uuid,
    (v_meta ->> 'role')::public.user_role,
    'active',
    v_meta ->> 'full_name'
  );

  update auth.users
     set raw_app_meta_data = jsonb_build_object(
       'daycare_id', v_meta -> 'daycare_id',
       'role',       v_meta -> 'role',
       'full_name',  v_meta -> 'full_name'
     )
   where id = new.id;

  return new;
end;
$$;
