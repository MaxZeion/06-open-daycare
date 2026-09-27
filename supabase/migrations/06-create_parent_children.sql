create extension if not exists pgcrypto schema extensions;

create type public.relationship_type as enum ('mother', 'father', 'guardian');

create table public.parent_children (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references public.users(id) on delete cascade,
  child_id     uuid not null references public.children(id) on delete cascade,
  relationship public.relationship_type not null,
  created_at   timestamptz not null default now(),
  constraint parent_children_parent_child_key unique (parent_id, child_id)
);

create index parent_children_child_id_idx on public.parent_children(child_id);

alter table public.parent_children enable row level security;

create policy "parent_children_select_authenticated" on public.parent_children for select to authenticated using (true);
create policy "parent_children_insert_authenticated" on public.parent_children for insert to authenticated with check (true);
create policy "parent_children_update_authenticated" on public.parent_children for update to authenticated using (true) with check (true);
create policy "parent_children_delete_authenticated" on public.parent_children for delete to authenticated using (true);
