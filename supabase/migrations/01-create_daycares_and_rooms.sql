create extension if not exists pgcrypto schema extensions;

create table public.daycares (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  created_at  timestamptz not null default now()
);

create table public.rooms (
  id          uuid        primary key default gen_random_uuid(),
  daycare_id  uuid        not null references public.daycares(id) on delete cascade,
  name        text        not null,
  created_at  timestamptz not null default now()
);

create index rooms_daycare_id_idx on public.rooms(daycare_id);

alter table public.daycares enable row level security;
alter table public.rooms     enable row level security;

create policy "daycares_select_authenticated"
  on public.daycares for select
  to authenticated
  using (true);

create policy "rooms_select_authenticated"
  on public.rooms for select
  to authenticated
  using (true);

insert into public.daycares (name)
values ('Guardería Sala Soles')
returning id;

insert into public.rooms (daycare_id, name)
select d.id, s.name
from public.daycares d
cross join (values
  ('Soles'),
  ('Lunas'),
  ('Estrellas'),
  ('Mariposas')
) as s(name)
where d.name = 'Guardería Sala Soles';
