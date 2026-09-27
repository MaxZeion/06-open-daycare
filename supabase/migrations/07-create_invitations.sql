create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'cancelled');

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references public.children(id) on delete cascade,
  invited_by   uuid not null references public.users(id) on delete restrict,
  full_name    text not null,
  email        text not null,
  relationship public.relationship_type not null,
  code         text not null unique,
  status       public.invitation_status not null default 'pending',
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index invitations_child_id_idx on public.invitations(child_id);
create index invitations_email_idx    on public.invitations(email);

alter table public.invitations enable row level security;

create policy "invitations_select_authenticated" on public.invitations for select to authenticated using (true);
create policy "invitations_insert_authenticated" on public.invitations for insert to authenticated with check (true);
create policy "invitations_update_authenticated" on public.invitations for update to authenticated using (true) with check (true);
create policy "invitations_delete_authenticated" on public.invitations for delete to authenticated using (true);

-- Chequeo de registro previo sin exponer auth.users ni usar service_role.
create function public.email_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email));
$$;

revoke execute on function public.email_exists(text) from public, anon;
grant execute on function public.email_exists(text) to authenticated;
