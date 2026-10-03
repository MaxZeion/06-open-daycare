-- supabase/migrations/16-create_posts_related_tables.sql
--
-- SPEC 16: el feed del staff deja de vivir en memoria (SPEC 07) y pasa a
-- persistirse en Supabase. La regla de negocio más sensible se aplica en
-- RLS, no en la UI: solo usuarios con role='staff' pueden INSERT en `posts`,
-- y solo el autor puede UPDATE/DELETE sus filas. Padres autenticados leen
-- el feed del mismo daycare que su staff.
--
-- Resuelve:
--   - Añade el valor 'mood' al enum `post_type` (SPEC 07 introdujo la
--     píldora ÁNIMO en la UI; el esquema destino no la contemplaba).
--   - Crea `posts`, `post_children` y `post_photos` con FKs, índices, RLS
--     restrictiva y grants endurecidos (mismo patrón que SPEC 11/migration 11).
--   - Helper SECURITY DEFINER `daycare_of_post(post)` para que las policies
--     de `post_children` y `post_photos` no recursen contra `public.users`
--     (mismo problema que la policy users_select_* corregida en migration 09).
--   - Seed fundación: 3 posts autoría del staff Alberto (analogos a los
--     3 mocks de SPEC 01: LOGRO + ACTIVIDAD + ANUNCIO) y 1 post_photo
--     que apunta al placeholder gráfico seed-actividad.jpg.
--
-- NO resuelve (queda fuera del scope):
--   - Reactions / comments (van en specs propios; schema destino las define).
--   - Feed de la familia (`/family/feed` con la maqueta `familia-feed.dc.html`).
--   - Supabase Storage. La carpeta `public/uploads/posts/` del proyecto
--     Next.js actúa de bucket propio.
--   - Edición / borrado de posts desde la UI (las policies DELETE existen
--     pero nadie las dispara).
--   - daily_summaries.

-- ========================================================================
-- ENUM: añadir 'mood' a post_type (escrito al inicio, antes de los CREATE
-- que referencian el tipo). El valor queda inutilizable dentro de la misma
-- transacción (limitación de Postgres para ADD VALUE) pero el seed no lo
-- necesita: usa achievement / activity / announcement. Cuando la UI
-- publique Ánimo en otra sesión, el valor ya estará committed.
-- ========================================================================

alter type public.post_type add value 'mood';

-- ========================================================================
-- HELPER: daycare_of_post(post) → uuid  (SECURITY DEFINER, bypass RLS)
-- ========================================================================
-- Resuelve a qué daycare pertenece un post via `posts.author_id →
-- public.users.daycare_id`. SECURITY DEFINER + `set search_path = ''`
-- evita el ciclo con la policy `users_select_*` de public.users y elimina
-- vectores de search-path injection. Patrón idéntico a los helpers
-- `daycare_of_child` y `daycare_of_room` introducidos en migration 11.

create or replace function public.daycare_of_post(p_post_id uuid)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select u.daycare_id
    from public.posts p
    join public.users  u on u.id = p.author_id
   where p.id = p_post_id;
$$;

revoke execute on function public.daycare_of_post(uuid) from public, anon;
grant  execute on function public.daycare_of_post(uuid) to authenticated;

-- ========================================================================
-- TABLAS: posts, post_children, post_photos
-- ========================================================================

create table public.posts (
  id            uuid        primary key default gen_random_uuid(),
  author_id     uuid        not null references public.users(id) on delete restrict,
  room_id       uuid        references public.rooms(id) on delete set null,
  type          public.post_type not null,
  title         text,
  body          text        not null,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index posts_published_at_idx on public.posts (published_at desc);
create index posts_author_id_idx    on public.posts (author_id);
create index posts_room_id_idx      on public.posts (room_id) where room_id is not null;

create table public.post_children (
  post_id   uuid not null references public.posts(id)    on delete cascade,
  child_id  uuid not null references public.children(id) on delete cascade,
  primary key (post_id, child_id)
);

create index post_children_child_id_idx on public.post_children (child_id);

create table public.post_photos (
  id          uuid        primary key default gen_random_uuid(),
  post_id     uuid        not null references public.posts(id) on delete cascade,
  url         text        not null,
  width       int,
  height      int,
  position    int         not null default 0,
  created_at  timestamptz not null default now()
);

create index post_photos_post_id_idx on public.post_photos (post_id, position);

-- ========================================================================
-- UPDATED_AT trigger en posts (reusa set_updated_at de migration 08)
-- ========================================================================

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ========================================================================
-- FORCE ROW LEVEL SECURITY en las 3 tablas (defensa en profundidad)
-- ========================================================================

alter table public.posts         force row level security;
alter table public.post_children force row level security;
alter table public.post_photos   force row level security;

-- ========================================================================
-- POLICIES — POSTS
-- ========================================================================
-- Reglas (siguiendo el patrón de migration 11):
--   - SELECT: usuarios autenticados del mismo daycare que el autor del post.
--   - INSERT: role=staff (del JWT app_metadata) y author_id = auth.uid().
--   - UPDATE / DELETE: solo el autor (author_id = auth.uid()).
-- day_care del viewer viene del JWT app_metadata (no recursiona con la
-- policy users_select_* corregida en migration 09). daycare del post
-- viene del helper SECURITY DEFINER `daycare_of_post` (tampoco recursiona).

drop policy if exists posts_select_same_daycare on public.posts;
drop policy if exists posts_insert_staff        on public.posts;
drop policy if exists posts_modify_author       on public.posts;

create policy posts_select_same_daycare
  on public.posts for select
  to authenticated
  using (
    public.daycare_of_post(id)::text
      = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

create policy posts_insert_staff
  on public.posts for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
  );

create policy posts_modify_author
  on public.posts for all
  to authenticated
  using       (author_id = (select auth.uid()))
  with check  (author_id = (select auth.uid()));

-- ========================================================================
-- POLICIES — POST_CHILDREN
-- ========================================================================
-- Reglas:
--   - SELECT: usuarios del mismo daycare que el post (helper bypass RLS).
--   - INSERT/DELETE: el post pertenece al viewer (author_id = auth.uid())
--     y el viewer tiene role=staff. UPDATE no se usa → sin policy, RLS
--     niega por defecto.

drop policy if exists post_children_select_same_daycare on public.post_children;
drop policy if exists post_children_modify_author       on public.post_children;

create policy post_children_select_same_daycare
  on public.post_children for select
  to authenticated
  using (
    public.daycare_of_post(post_id)::text
      = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

create policy post_children_modify_author
  on public.post_children for all
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_id = (select auth.uid())
    )
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_id = (select auth.uid())
    )
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
  );

-- ========================================================================
-- POLICIES — POST_PHOTOS (mismas reglas que post_children)
-- ========================================================================

drop policy if exists post_photos_select_same_daycare on public.post_photos;
drop policy if exists post_photos_modify_author       on public.post_photos;

create policy post_photos_select_same_daycare
  on public.post_photos for select
  to authenticated
  using (
    public.daycare_of_post(post_id)::text
      = (select auth.jwt() -> 'app_metadata' ->> 'daycare_id')
  );

create policy post_photos_modify_author
  on public.post_photos for all
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_id = (select auth.uid())
    )
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_id = (select auth.uid())
    )
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
  );

-- ========================================================================
-- GRANTS — anon no toca nada; authenticated lo que las policies permiten
-- ========================================================================

revoke all on table public.posts         from anon;
revoke all on table public.post_children from anon;
revoke all on table public.post_photos   from anon;

-- authenticated: grants mantenidos donde hay policy explícita. trigger /
-- references / truncate se revocan siempre (defensa en profundidad).
revoke trigger, references, truncate on table public.posts         from authenticated;
revoke trigger, references, truncate on table public.post_children from authenticated;
revoke trigger, references, truncate on table public.post_photos   from authenticated;

-- service_role conserva todos los grants (server-side, bypass RLS).

-- ========================================================================
-- SEED — 3 posts análogos a los mocks de SPEC 01 + 1 photo
-- ========================================================================
-- Staff autor: Alberto (única fila con role='staff' en users).
-- Los 3 posts publicados a '2026-10-03' (maqueta: 14:20 / 09:40 / 07:50
-- hora local). Se almacenan en UTC; la UI los formatea a Europe/Madrid.

do $$
declare
  v_staff_id  uuid;
  v_andre_id  uuid;
  v_hugo_id   uuid;
  v_post_logro_id    uuid;
  v_post_act_id      uuid;
  v_post_anun_id     uuid;
begin
  select id into v_staff_id from public.users where role = 'staff' limit 1;
  select id into v_andre_id from public.children where full_name = 'André López'  limit 1;
  select id into v_hugo_id  from public.children where full_name = 'Hugo Vega'    limit 1;

  if v_staff_id is null then
    raise exception 'Seed abortado: no hay usuario con role=staff en public.users';
  end if;
  if v_andre_id is null or v_hugo_id is null then
    raise exception 'Seed abortado: faltan niños André López o Hugo Vega en public.children';
  end if;

  -- POST 1 — LOGRO (privado, 1 niño)
  insert into public.posts (author_id, type, body, published_at)
  values (v_staff_id, 'achievement',
          '¡Usó el orinal solito por primera vez! Estaba feliz de contárselo a todos. Un gran paso.',
          '2026-10-03 12:20:00+00'::timestamptz)
  returning id into v_post_logro_id;

  insert into public.post_children (post_id, child_id) values (v_post_logro_id, v_andre_id);

  -- POST 2 — ACTIVIDAD (privado, 1 niño + 1 foto)
  insert into public.posts (author_id, type, body, published_at)
  values (v_staff_id, 'activity',
          'Pintamos con témperas esta mañana. Hugo eligió el azul para todo y se concentró un montón mezclando colores.',
          '2026-10-03 07:40:00+00'::timestamptz)
  returning id into v_post_act_id;

  insert into public.post_children (post_id, child_id) values (v_post_act_id, v_hugo_id);

  insert into public.post_photos (post_id, url, width, height, position)
  values (v_post_act_id, '/uploads/posts/seed/seed-actividad.jpg', 1200, 800, 0);

  -- POST 3 — ANUNCIO (general, sin niños → recipient "toda la sala")
  insert into public.posts (author_id, type, body, published_at)
  values (v_staff_id, 'announcement',
          'El viernes salimos al parque por la mañana. Recuerden mandar gorra y una botellita de agua.',
          '2026-10-03 05:50:00+00'::timestamptz)
  returning id into v_post_anun_id;
end $$;