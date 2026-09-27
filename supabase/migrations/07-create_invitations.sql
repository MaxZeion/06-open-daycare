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

-- Lectura de una invitación por código para el flujo de activación, que
-- ocurre sin sesión (rol anon). SECURITY DEFINER: devuelve solo la fila
-- cuyo código coincide; nunca la tabla completa.
create function public.validate_invitation(p_code text)
returns table (
  invitation_id    uuid,
  child_id         uuid,
  parent_full_name text,
  parent_email     text,
  relationship     public.relationship_type,
  status           public.invitation_status,
  expires_at       timestamptz,
  daycare_id       uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select i.id, i.child_id, i.full_name, i.email, i.relationship, i.status, i.expires_at, r.daycare_id
    from public.invitations i
    join public.children c on c.id = i.child_id
    left join public.rooms r on r.id = c.room_id
   where i.code = p_code;
$$;

revoke all on function public.validate_invitation(text) from public;
grant execute on function public.validate_invitation(text) to anon, authenticated;

-- Expiración lazy: marca como expired una invitación pending cuyo
-- expires_at ya pasó. Llamada desde /activate (anon o authenticated).
create function public.expire_invitation(p_invitation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.invitations
     set status = 'expired'
   where id = p_invitation_id
     and status = 'pending'
     and expires_at < now();
$$;

revoke all on function public.expire_invitation(uuid) from public;
grant execute on function public.expire_invitation(uuid) to anon, authenticated;
