create extension if not exists pgcrypto schema extensions;

create type public.child_status as enum ('active', 'archived');

create table public.children (
  id            uuid        primary key default gen_random_uuid(),
  room_id       uuid        references public.rooms(id) on delete set null,
  full_name     text        not null,
  birth_date    date        not null,
  enrolled_at   date        not null default current_date,
  medical_notes text,
  allergy_tags  text[]      not null default '{}',
  photo_consent boolean     not null default true,
  status        public.child_status not null default 'active',
  created_at    timestamptz not null default now()
);

create index children_room_id_idx on public.children(room_id);

alter table public.children enable row level security;

create policy "children_select_authenticated"
  on public.children for select
  to authenticated
  using (true);

create policy "children_insert_authenticated"
  on public.children for insert
  to authenticated
  with check (true);

create policy "children_update_authenticated"
  on public.children for update
  to authenticated
  using (true) with check (true);

create policy "children_delete_authenticated"
  on public.children for delete
  to authenticated
  using (true);
