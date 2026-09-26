create extension if not exists pgcrypto schema extensions;

create type public.user_role  as enum ('staff', 'parent', 'admin');
create type public.user_status as enum ('pending', 'active');

create table public.users (
  id                     uuid primary key references auth.users(id) on delete cascade,
  daycare_id             uuid not null references public.daycares(id) on delete restrict,
  role                   public.user_role  not null,
  status                 public.user_status not null default 'active',
  full_name              text not null,
  avatar_url             text,
  notify_on_post         boolean not null default true,
  daily_summary_enabled  boolean not null default true,
  created_at             timestamptz not null default now()
);

create index users_daycare_id_idx on public.users(daycare_id);
create index users_role_idx       on public.users(role);

alter table public.users enable row level security;

create policy "users_select_authenticated"
  on public.users for select
  to authenticated
  using (true);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_daycare_id uuid             := (new.raw_user_meta_data ->> 'daycare_id')::uuid;
  v_role       public.user_role := (new.raw_user_meta_data ->> 'role')::public.user_role;
  v_full_name  text             := new.raw_user_meta_data ->> 'full_name';
begin
  insert into public.users (id, daycare_id, role, status, full_name)
  values (new.id, v_daycare_id, v_role, 'active', v_full_name);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, raw_app_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'staff@opendaycare.com',
  crypt('staff1234', gen_salt('bf')),
  now(),
  jsonb_build_object(
    'daycare_id', (select id from public.daycares where name = 'Guardería Sala Soles'),
    'role',       'staff',
    'full_name',  'Staff Sala Soles'
  ),
  '{}'::jsonb,
  now(),
  now()
);
