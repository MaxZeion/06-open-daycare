-- supabase/migrations/20-create_daily_summaries.sql
--
-- SPEC 20: tabla `daily_summaries` para el "Resumen del día" de la familia
-- (maqueta pantallas/resumen-dia.dc.html). El esquema destino
-- (../07-DB-Schema/opendaycare-database-schema.md:213-228) la define con
-- UNIQUE(child_id, date); hasta hoy solo existía como comentario en la
-- migration 16.
--
-- Reglas:
--   - SELECT: padre con vínculo en parent_children sobre el niño, o
--     staff/admin del mismo daycare del niño (patrón
--     parent_children_select_self_or_staff_same_daycare, migration 11).
--   - INSERT/UPDATE/DELETE: solo role='staff' del mismo daycare (writer
--     por staff; el padre solo lee). El writer desde la app llega en un
--     spec futuro — esta fase la tabla arranca vacía (SIN SEED).
--   - `date` es tipo `date` (sin zona). Convención "hoy" Europe/Madrid:
--     to_char((now() at time zone 'Europe/Madrid'), 'YYYY-MM-DD') — tanto
--     en la query de la app como en futuros inserts del writer.
--
-- Helpers reutilizados: patrón inline EXISTS sobre parent_children (igual
-- que children_select_parent_or_staff_same_daycare en la DB viva — las
-- policies no aplican RLS sobre las tablas que referencian, así que no hay
-- recursión) + daycare_of_child() SECURITY DEFINER de migration 11.

-- ========================================================================
-- TABLA
-- ========================================================================

create table public.daily_summaries (
  id               uuid        primary key default gen_random_uuid(),
  child_id         uuid        not null references public.children(id) on delete cascade,
  date             date        not null,
  meals_count      int         not null default 0,
  sleep_minutes    int         not null default 0,
  activities_count int         not null default 0,
  mood             text,
  highlight        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint daily_summaries_child_id_date_key unique (child_id, date)
);

create index daily_summaries_child_id_idx on public.daily_summaries (child_id);
create index daily_summaries_date_idx     on public.daily_summaries (date);

-- ========================================================================
-- RLS
-- ========================================================================

alter table public.daily_summaries enable row level security;
alter table public.daily_summaries force row level security;

drop policy if exists daily_summaries_select_own_children on public.daily_summaries;
drop policy if exists daily_summaries_modify_staff_same_daycare on public.daily_summaries;

create policy daily_summaries_select_own_children
  on public.daily_summaries for select
  to authenticated
  using (
    -- Padre: tiene vínculo con el niño (inline EXISTS, patrón de la DB viva;
    -- las policies no aplican RLS sobre parent_children → sin recursión).
    exists (
      select 1 from public.parent_children pc
      where pc.child_id = daily_summaries.child_id
        and pc.parent_id = (select auth.uid())
    )
    or
    -- Staff/admin: el niño pertenece a su daycare (helper bypass RLS).
    (
      (select auth.jwt() -> 'app_metadata' ->> 'role') in ('staff', 'admin')
      and public.daycare_of_child(child_id)::text
            = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
    )
  );

create policy daily_summaries_modify_staff_same_daycare
  on public.daily_summaries for all
  to authenticated
  using (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
    and public.daycare_of_child(child_id)::text
          = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  )
  with check (
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
    and public.daycare_of_child(child_id)::text
          = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

-- ========================================================================
-- UPDATED_AT trigger (reusa set_updated_at de migration 08/10)
-- ========================================================================

drop trigger if exists daily_summaries_set_updated_at on public.daily_summaries;
create trigger daily_summaries_set_updated_at
  before update on public.daily_summaries
  for each row execute function public.set_updated_at();

-- ========================================================================
-- GRANTS — anon no toca nada; authenticated solo lo que la policy permite
-- ========================================================================

revoke all on table public.daily_summaries from anon;

-- authenticated: SELECT (padre lee) + escritura (staff via policy).
-- trigger / references / truncate se revocan siempre (defensa en
-- profundidad, mismo patrón que migrations 11/16).
revoke trigger, references, truncate on table public.daily_summaries from authenticated;

-- service_role conserva todos los grants (server-side, bypass RLS).
