# SPEC 20 — Feed familiar filtrado por hijos + Resumen del día

> **Status:** Implemented
> **Depends on:** SPEC 08 (daycares/rooms seed), SPEC 09 (users + role), SPEC 10 (login + getCurrentUser + requireRole), SPEC 11 (kids from Supabase + harden parent_children/children RLS), SPEC 12 (parent invitation + activation), SPEC 16 (posts/post_children/post_photos), SPEC 19 (audience-aware FeedPageClient)
> **Date:** 2026-10-03
> **Objective:** Mostrar al padre en `/familiar` el feed real filtrado por sus hijos vinculados (incluyendo anuncios de "toda la sala") y conectar el sidebar "Resumen del día" con una nueva tabla `daily_summaries`, dejando RLS endurecido para `role='parent'`.

## Why this spec exists

`/familiar` siempre ha rendido cero publicaciones para cualquier padre desde el split staff/familia (cambio `separate-staff-and-family-panels`). Causa:

- `app/(family)/familiar/page.tsx:13` monta `<FeedPageClient header={...} />` sin pasar la prop `posts`. Como `posts` defaulta a `[]` (`app/(staff)/_components/feed/FeedPageClient.tsx:18`), el feed renderiza siempre vacío.
- `listFeedPosts()` (`utils/supabase/posts.ts:138-194`) no filtra por `parent_children`: cualquier `authenticated` del mismo daycare ve todos los posts. El padre vería posts de niños que no son los suyos si la página llamara al helper sin más.

Esta deuda está documentada y reconocida en specs previos:

- OpenSpec archive `separate-staff-and-family-panels/design.md:67`: *"URL `/familiar` queda vacía de contenido propio (mismo feed mock) → aceptable: este cambio sienta la base; el contenido diferenciado llega con el filtrado real por `post_children` y 'Resumen del día'."*
- `specs/12-parent-invitation-and-activation.md:31, 212`: *"Feed de familia ni filtrado del feed por padre (`post_children`)"* — explícitamente fuera de scope.
- `specs/19-extract-staff-feed-composer.md:36-43, 127-129`: cambios en `listFeedPosts`, ni en la DB / migraciones — fuera de scope; el filtrado por padre es otro spec.

El sidebar de familia tiene un ítem "Resumen del día" (`pantallas/familia-resumen-dia.dc.html`) que enlaza a `pantallas/resumen-dia.dc.html`. La maqueta dibuja un resumen diario con métricas (`comidas`, `siesta`, `momentos`), `ánimo` y `highlight`. La tabla `daily_summaries` está definida en el schema de referencia (`07-DB-Schema/opendaycare-database-schema.md:213-228`, UNIQUE(`child_id`, `date`)) pero **no existe** en la DB actual — solo se menciona en un comentario de la migración 16.

Este spec cierra los 3 puntos en una sola unidad: filtro del feed por hijos vinculados, tabla `daily_summaries` y la ruta `/resumen`, más el endurecimiento de RLS para que `role='parent'` no pueda SELECTear posts ajenos por SQL directo.

## Scope

**In (Feed filtrado):**

- `utils/supabase/posts.ts`: añadir `listFeedPostsForParent(currentUser: CurrentUser): Promise<FeedPost[]>` — query que une `posts` ↔ `post_children` filtrada por `parent_children.parent_id = currentUser.userId`, **incluyendo** posts con `post_children` vacío (anuncios / "toda la sala"). Reutiliza `FeedPost`/`PostRow`/`PostChildRow`/`formatTimeEuropeMadrid`/`buildRecipient`/`MAP_KIND` ya existentes. La función `listFeedPosts()` actual (sin sufijo) **se mantiene** para uso de staff.
- `app/(family)/familiar/page.tsx`: llamar a `listFeedPostsForParent(currentUser)` y pasar `posts={posts}` a `<FeedPageClient>`. Si `posts.length === 0`, mostrar empty state antes del divider `PUBLICADO HOY`: texto "Aún no hay publicaciones de tus peques." centrado, con icono sutil y padding vertical generoso para que el divider no quede pegado arriba.
- `FeedPageClient.tsx` no cambia — sigue aceptando `posts?: FeedPost[]` opcional.
- Regresión: `/` (staff) sigue llamando a `listFeedPosts()` y rendiendo sin cambios.

**In (Resumen del día):**

- Nueva migración `supabase/migrations/20-create_daily_summaries.sql`:
  - Tabla `public.daily_summaries` con PK `id uuid`, FK `child_id → public.children`, `date date`, `meals_count int`, `sleep_minutes int`, `activities_count int`, `mood text`, `highlight text`, `created_at`/`updated_at timestamptz`, `UNIQUE (child_id, date)`.
  - Índices: `daily_summaries_child_id_idx (child_id)`, `daily_summaries_date_idx (date)`.
  - RLS on (`force row level security`).
  - Policies:
    - `daily_summaries_select_own_children`: SELECT a `authenticated` solo si EXISTS (parent_children con mismo daycare) — mismo patrón que `parent_children_select_self_or_staff_same_daycare` (`supabase/migrations/11-harden_remaining_tables.sql:224-235`).
    - `daily_summaries_modify_staff_same_daycare`: ALL a usuarios con `role='staff'` del mismo daycare. (Writer por staff; el padre solo lee.)
  - **Sin seed** — la tabla arranca vacía. UI muestra estado vacío tipado.
- `utils/supabase/daily-summaries.ts` (nuevo): `listDailySummariesForParent(currentUser, date)` que devuelve los summaries de los hijos del padre en `date = today` (Europe/Madrid) con su `child` join (`children:child_id (id, full_name, room:room_id (name))`).
- Nueva ruta `app/(family)/resumen/page.tsx` (Server Component con `requireRole('parent', DEFAULT_STAFF_NEXT, '/resumen')`):
  - Llama a `listDailySummariesForParent(currentUser, today)`.
  - Renderiza un client wrapper con el layout del maqueta `pantallas/resumen-dia.dc.html:42-71`: chips de niños vinculados (si hay 1 solo, no se muestran chips), hero "RESUMEN DEL DÍA / El día de {nombre} / {fecha}", 3 tarjetas (comidas / siesta / momentos), card de ánimo, sección "Lo más lindo de hoy" con top 2 posts del feed del día del niño seleccionado (filtrado por `type IN ('achievement', 'activity', 'meal')` ordenado por `published_at`).
  - Estado vacío cuando no hay summaries: "Mañana habrá mucho más que ver ✨" o similar.
- `app/(family)/_components/resumen/FamilyDailySummaryClient.tsx` (nuevo, client wrapper con `useState` para el niño seleccionado en los chips).
- `components/shared/FamilySidebar.tsx`: revisar el `href` actual del ítem "Resumen del día". Si apunta a `#` o a la maqueta (`.dc.html`), cambiar a `/resumen`.

**In (RLS):**

- Nueva migración `supabase/migrations/20-harden_posts_rls_for_parents.sql` (o anexo al archivo anterior — ver Decisions):
  - Drop de `posts_select_same_daycare` (SPEC 16).
  - Crear `posts_select_parent_or_staff_same_daycare`: SELECT a `authenticated` con `USING` que branche por `auth.jwt() ->> 'app_metadata' ->> 'role'`:
    - Si `role = 'staff'` o `role = 'admin'` → policy actual abierta (mismo daycare).
    - Si `role = 'parent'` → `(daycare_id = current_daycare) AND (NOT EXISTS (SELECT 1 FROM post_children WHERE post_id = posts.id) OR EXISTS (SELECT 1 FROM post_children pc JOIN parent_children pch ON pc.child_id = pch.child_id WHERE pc.post_id = posts.id AND pch.parent_id = auth.uid()))`.
  - Drop de `post_children_select_same_daycare` (SPEC 16).
  - Crear `post_children_select_parent_or_staff_same_daycare`: misma idea — staff/admin ven todo del daycare; parent solo ve filas donde `EXISTS (parent_children matching)`. Esto evita que un padre liste `post_children` de niños ajenos.
  - Mantener `posts_insert_staff`, `posts_modify_author`, `post_children_modify_author`, `post_photos_*` sin cambios (solo SELECT cambia).
  - **Bypass de RLS** para las sub-queries dentro de las nuevas policies: la policy de `parent_children` (`supabase/migrations/11-harden_remaining_tables.sql:41-44`) ya tiene un patrón `set_config` o funciones SECURITY DEFINER para evitar recursión; replicar el mismo patrón si fuera necesario. Si la policy de `parent_children` actual ya permite al padre ver sus propias filas (que es lo que necesitamos desde la policy de `posts`), no se necesita bypass adicional — la policy de `posts` hace un JOIN a `parent_children` y el row-level security de esa tabla permite leer solo las filas propias, lo cual es exactamente lo que queremos.
- Regenerar `types/supabase.ts` con `supabase_generate_typescript_types` del MCP tras aplicar la migración.

**Out of scope:**

- Chips de filtro en el feed familiar (`pantallas/familia-feed.dc.html:49-53` — "Mateo", "Sofía", "Todos") — spec futuro.
- Crear/editar `daily_summaries` desde la app (la maestra aún no escribe el resumen en esta fase). Cuando llegue, será un spec con su propio writer en una Server Action del lado staff.
- Likes, comentarios, reacciones (tablas existen en schema pero no se persisten ni se consultan aún).
- Paginación del feed familiar (los posts del día caben en una pantalla).
- Formato de fecha localizado del feed ("martes 17 jun") — sigue en el placeholder del SPEC 19; va en el spec de binding de usuario.
- Cambiar `listFeedPosts()` actual (staff) — sin cambios.
- Cambios en `FeedPageClient`, `FeedContext`, `NewPostModal`, `PostCard`.
- Tests automatizados (no hay runner; verificación = `lint` + `build` + Playwright + `db-security-audit`).

## Data model

### Nueva tabla `public.daily_summaries`

```sql
create table public.daily_summaries (
  id              uuid primary key default gen_random_uuid(),
  child_id        uuid not null references public.children(id) on delete cascade,
  date            date not null,
  meals_count     int not null default 0,
  sleep_minutes   int not null default 0,
  activities_count int not null default 0,
  mood            text,
  highlight       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (child_id, date)
);

create index daily_summaries_child_id_idx on public.daily_summaries (child_id);
create index daily_summaries_date_idx on public.daily_summaries (date);

alter table public.daily_summaries enable row level security;
alter table public.daily_summaries force row level security;
```

### Modificaciones a RLS (sin nuevas tablas en el segundo archivo)

```sql
-- Reemplaza posts_select_same_daycare
drop policy if exists posts_select_same_daycare on public.posts;
create policy posts_select_parent_or_staff_same_daycare
  on public.posts for select
  to authenticated
  using (
    daycare_id = (auth.jwt() ->> 'app_metadata' ->> 'daycare_id')::uuid
    and (
      coalesce((auth.jwt() ->> 'app_metadata' ->> 'role') = 'staff', false)
      or coalesce((auth.jwt() ->> 'app_metadata' ->> 'role') = 'admin', false)
      or not exists (
        select 1 from public.post_children pc
        where pc.post_id = posts.id
      )
      or exists (
        select 1
        from public.post_children pc
        join public.parent_children pch on pch.child_id = pc.child_id
        where pc.post_id = posts.id
          and pch.parent_id = auth.uid()
      )
    )
  );

-- Reemplaza post_children_select_same_daycare
drop policy if exists post_children_select_same_daycare on public.post_children;
create policy post_children_select_parent_or_staff_same_daycare
  on public.post_children for select
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_children.post_id
        and p.daycare_id = (auth.jwt() ->> 'app_metadata' ->> 'daycare_id')::uuid
        and (
          coalesce((auth.jwt() ->> 'app_metadata' ->> 'role') = 'staff', false)
          or coalesce((auth.jwt() ->> 'app_metadata' ->> 'role') = 'admin', false)
          or exists (
            select 1 from public.parent_children pch
            where pch.child_id = post_children.child_id
              and pch.parent_id = auth.uid()
          )
        )
    )
  );
```

> Nota: la policy de `parent_children` (`parent_children_select_self_or_staff_same_daycare`, SPEC 11) ya filtra por `auth.uid()`. El JOIN desde `posts` hacia `parent_children` verá solo las filas del propio padre — no necesita bypass adicional.

## Implementation plan

1. `supabase/migrations/20-create_daily_summaries.sql`:
   - Crear tabla `public.daily_summaries` con PK uuid, FKs, defaults, UNIQUE(child_id, date), índices `daily_summaries_child_id_idx` y `daily_summaries_date_idx`.
   - Habilitar y forzar RLS.
   - Policies: `daily_summaries_select_own_children` (parent o staff same daycare) y `daily_summaries_modify_staff_same_daycare` (staff del mismo daycare).
   - Trigger `set_updated_at` sobre UPDATE (mismo patrón que SPEC 11).
   - Aplicar con `apply_migration(name="20_create_daily_summaries", query=<sql>)`.
2. `supabase/migrations/20-harden_posts_rls_for_parents.sql`:
   - DROP `posts_select_same_daycare`, CREATE `posts_select_parent_or_staff_same_daycare` (USING branching por role desde JWT).
   - DROP `post_children_select_same_daycare`, CREATE `post_children_select_parent_or_staff_same_daycare` (mismo patrón).
   - Aplicar con `apply_migration(name="20_harden_posts_rls_for_parents", query=<sql>)`.
3. Verificar migraciones con queries al MCP:
   - `list_tables` muestra `public.daily_summaries` con columnas y FKs correctas.
   - `pg_class.relrowsecurity = true` para `daily_summaries`, `posts`, `post_children`.
   - `pg_policy` lista 2 policies nuevas en `daily_summaries`, 1 replacement en `posts`, 1 replacement en `post_children`.
   - `pg_indexes` lista los 2 índices nuevos de `daily_summaries`.
4. Regenerar `types/supabase.ts` con `supabase_generate_typescript_types` del MCP; commit del cambio.
5. `utils/supabase/posts.ts`:
   - Añadir import de `parent_children` (vía select encadenado) y nueva función `listFeedPostsForParent(currentUser: CurrentUser): Promise<FeedPost[]>`.
   - Query: `from('posts').select('id, type, body, published_at, author_id, author:author_id (full_name), post_children:post_children!post_children_post_id_fkey (child_id, children:child_id (id, full_name, room:room_id (name))), post_photos (id, url, width, height, position)').order('published_at', {ascending: false})` con `.or` filter por author_id same_daycare AND (post_children in parent_children OR post_children vacío).
   - Estrategia: usar `.or(\`author_id.eq.${staffId},...\`, { foreignTable: 'post_children' })` no es directo. Alternativa: dos queries (1: parent_children → child_ids; 2: posts con filter por esos IDs + OR vacío) y merge en JS; o un RPC `get_feed_for_parent(parent_id uuid, daycare_id uuid)` en la DB que encapsule la lógica.
   - **Decisión técnica**: crear un RPC `public.get_feed_for_parent(p_parent_id uuid, p_daycare_id uuid) returns setof public.posts` en una nueva mini-migración `20-rpc_get_feed_for_parent.sql`. Más limpio, una sola fuente de filtrado (que coincide con la RLS), performante con índices. Devuelve los IDs de `posts` que el padre debe ver; el caller hace la query completa con joins por esos IDs (`in.(...)`).
6. `supabase/migrations/20-rpc_get_feed_for_parent.sql`:
   - `create or replace function public.get_feed_for_parent(p_parent_id uuid, p_daycare_id uuid) returns table (id uuid) language sql security definer set search_path = public, pg_temp stable as $$ ... $$;`
   - La función consulta `posts` con la MISMA lógica que la policy (author_id same daycare AND (sin post_children OR matching parent_children)) — defense in depth: si alguien rompe la policy, el RPC sigue filtrando correctamente.
   - `grant execute on function public.get_feed_for_parent(uuid, uuid) to authenticated;`
7. `utils/supabase/posts.ts`: usar el RPC como filtro para la query principal.
8. `app/(family)/familiar/page.tsx`:
   - Importar `listFeedPostsForParent`.
   - `const posts = await listFeedPostsForParent(currentUser);` después del `requireRole`.
   - Pasar `posts={posts}` a `<FeedPageClient>`.
   - Si `posts.length === 0`, el `FeedPageClient` necesita un slot para empty state. **Decisión técnica**: añadir un prop opcional `emptyState?: ReactNode` a `FeedPageClient` (se monta entre `{children}` y el divider `PUBLICADO HOY`, análogo al slot existente). Para `/familiar`: `<FeedPageClient posts={posts} header={...} emptyState={<FamilyFeedEmptyState />} />`. Nuevo componente `app/(family)/_components/feed/FamilyFeedEmptyState.tsx`.
9. `app/(family)/_components/feed/FamilyFeedEmptyState.tsx` (nuevo, server component simple con icono + texto).
10. `utils/supabase/daily-summaries.ts` (nuevo): tipos + `listDailySummariesForParent(currentUser, date)`.
11. `app/(family)/_components/resumen/FamilyDailySummaryClient.tsx` (nuevo, client):
    - Recibe `summaries: DailySummary[]` y `children: Child[]` (lista de hijos vinculados al padre con su info).
    - `useState` para `selectedChildId`.
    - Chips de niños (Mateo / Sofía / Todos no — los nombres reales).
    - Hero, 3 tarjetas de métricas, card de ánimo, sección "Lo más lindo de hoy".
12. `app/(family)/resumen/page.tsx` (nuevo, server):
    - `await requireRole("parent", DEFAULT_STAFF_NEXT, "/resumen")`.
    - Fetch `summaries` y `children` (de `parent_children` joined con `children`) en paralelo.
    - Renderiza `<FamilyShell active="summary"><FamilyDailySummaryClient summaries={...} children={...} /></FamilyShell>`.
13. `components/shared/FamilySidebar.tsx`: ajustar el `href` de "Resumen del día" si hoy es `#` o `.dc.html`.
14. `npm run lint && npm run build` exit 0.
15. Verificación visual con Playwright + visión:
    - Como `zeionsoft@gmail.com`: `/familiar` muestra los posts de Darcy + el ANUNCIO seed; console 0 errores. Screenshot `.mcp-playwright/spec-20-family-feed.png`.
    - Como `zeionsoft@gmail.com`: `/resumen` muestra layout con chips del niño + empty state de summary (tabla vacía). Screenshot `.mcp-playwright/spec-20-family-summary.png`.
    - Como `staff@opendaycare.com`: `/` sigue mostrando los 3 posts seed. Regresión visual.
16. Auditor de seguridad: `/db-security-audit 20` (agente `db-security-auditor`) verifica con `set local role anon / authenticated / staff / parent` que las nuevas policies bloquean fugas entre niños/padres/guarderías.

## Acceptance criteria

- [x] `supabase/migrations/20-create_daily_summaries.sql` existe; `apply_migration` aplicado; `list_tables` muestra `public.daily_summaries` con columnas `id, child_id, date, meals_count, sleep_minutes, activities_count, mood, highlight, created_at, updated_at`, FK a `public.children`, `UNIQUE(child_id, date)` — ok: archivo en repo + `list_tables(schemas=["public"], verbose=true)` con todas las columnas esperadas + FK `daily_summaries_child_id_fkey → public.children(id)` + `daily_summaries_child_id_date_key` UNIQUE (ver `apply_migration` `20261003215512_20_create_daily_summaries` aplicada).
- [x] `public.daily_summaries` tiene `rls_enabled = true` y `force_row_level_security = true`. `pg_indexes` lista `daily_summaries_child_id_idx` y `daily_summaries_date_idx` — ok: `pg_class.relrowsecurity=true`, `pg_class.relforcerowsecurity=true`; `pg_indexes` devuelve `daily_summaries_child_id_idx` y `daily_summaries_date_idx` (más `daily_summaries_pkey` y la UNIQUE `daily_summaries_child_id_date_key`).
- [x] `pg_policy` en `public.daily_summaries` muestra 2 policies: `daily_summaries_select_own_children` (cmd `r`) y `daily_summaries_modify_staff_same_daycare` (cmd `a`) — ok: `pg_policies` lista ambas con `roles={authenticated}`; `select` muestra cmd `SELECT`, `modify` muestra cmd `ALL`.
- [x] `supabase/migrations/20-harden_posts_rls_for_parents.sql` existe; aplicado; `posts` y `post_children` tienen las nuevas policies (`posts_select_parent_or_staff_same_daycare`, `post_children_select_parent_or_staff_same_daycare`) y NO las antiguas (`posts_select_same_daycare`, `post_children_select_same_daycare` están DROPed) — ok: `pg_policies` muestra `posts_select_parent_or_staff_same_daycare` (cmd SELECT) y `post_children_select_parent_or_staff_same_daycare` (cmd SELECT); query de las policies antiguas devuelve 0 filas (DROPed).
- [x] RPC `public.get_feed_for_parent(uuid, uuid)` existe; `grant execute` a `authenticated`; devuelve solo IDs de posts que cumplen la regla (parent_children matching OR vacío) — ok: `pg_proc` muestra la función con args `(p_parent_id uuid, p_daycare_id uuid)`, `security_definer=true`, `volatility=s` (stable); `has_function_privilege('authenticated', 'get_feed_for_parent', 'EXECUTE')=true` (y `anon`/`public` = false). Verificación cruzada: `select count(*) from posts` como zeionsoft con JWT simulado devuelve 3 posts (1 actividad de Darcy + 2 anuncios), mismo set que `get_feed_for_parent(...)`.
- [x] `types/supabase.ts` regenerado, incluye el nuevo tipo `daily_summaries` y la nueva función RPC. `git diff` muestra cambios coherentes — ok: `Database.public.Tables.daily_summaries` con Row/Insert/Update (líneas 67-122) + `Database.public.Functions.get_feed_for_parent` (líneas 441-446) + `is_parent_of` y `post_visible_to_parent` (líneas 447-448); `git diff --stat main HEAD`: `types/supabase.ts | 59 ++++-`.
- [x] `utils/supabase/posts.ts` exporta `listFeedPostsForParent(currentUser: CurrentUser): Promise<FeedPost[]>`. La query filtra correctamente por `parent_children` del padre (verificable con `set local role parent` y comparando IDs) — ok: `listFeedPostsForParent` (líneas 203-237) llama `supabase.rpc("get_feed_for_parent", { p_parent_id, p_daycare_id })` y luego `from("posts").select(POSTS_FEED_SELECT).in("id", ids)`. Verificado con `set local role authenticated` + `set_config('request.jwt.claims', ...)` simulado a zeionsoft: query `select count(*) from posts` = 3 (vs. 9 totales sin filtro).
- [x] `utils/supabase/daily-summaries.ts` existe; exporta `listDailySummariesForParent(currentUser, date): Promise<DailySummary[]>` que filtra por hijos del padre en la fecha dada — ok: archivo en repo; export `listDailySummariesForParent(currentUser, date)` (líneas 113-145) que primero obtiene `parent_children.child_id` por `eq("parent_id", currentUser.userId)`, después `from("daily_summaries").select(SUMMARY_CHILD_JOIN).in("child_id", childIds).eq("date", date)`. Además exporta `listParentChildren` y `todayEuropeMadrid`.
- [x] `app/(family)/familiar/page.tsx` llama a `listFeedPostsForParent(currentUser)` y pasa `posts={posts}` y (si está vacío) `emptyState={<FamilyFeedEmptyState />}` a `<FeedPageClient>`. `git diff` muestra el cambio — ok: archivo en repo (23 líneas); `const posts = await listFeedPostsForParent(currentUser);` y `<FeedPageClient posts={posts} header={...} emptyState={posts.length === 0 ? <FamilyFeedEmptyState /> : undefined} />`. `git diff --stat` muestra `app/(family)/familiar/page.tsx | 7 +-`.
- [x] `FeedPageClient` acepta prop opcional `emptyState?: ReactNode` y lo monta entre `{children}` y el divider `PUBLICADO HOY`. Sin `emptyState` → no se renderiza (backward compatible) — ok: `app/(staff)/_components/feed/FeedPageClient.tsx:11-21` declara `emptyState?: ReactNode` en props; líneas 60-62 renderizan `{children}` → `{emptyState}` → divider. Sin prop, JSX `{emptyState}` = undefined → no se renderiza nada (compatible con uso staff que no pasa la prop).
- [x] `app/(family)/_components/feed/FamilyFeedEmptyState.tsx` existe y renderiza icono + texto "Aún no hay publicaciones de tus peques." con padding vertical suficiente para que el divider no quede pegado arriba — ok: archivo en repo (12 líneas), `<div className="flex flex-col items-center gap-3 py-16 text-center">` con `<SunIcon className="size-9 text-muted" />` + `<p>Aún no hay publicaciones de tus peques.</p>`. Confirmado visualmente con screenshot `.mcp-playwright/spec-20-family-feed-empty.png` (el divider `PUBLICADO HOY` queda bien separado).
- [x] `app/(family)/resumen/page.tsx` existe, llama a `requireRole("parent", ...)`, fetcha summaries + children, renderiza dentro de `<FamilyShell active="summary">`. `git diff` muestra archivo nuevo — ok: archivo en repo (45 líneas), `await requireRole("parent", DEFAULT_STAFF_NEXT, "/resumen")`, `Promise.all([listDailySummariesForParent, listParentChildren, listFeedPostsForParent])`, `<FamilyShell active="summary">`. `git diff --stat` muestra `app/(family)/resumen/page.tsx | 45 ++++` (archivo nuevo).
- [x] `app/(family)/_components/resumen/FamilyDailySummaryClient.tsx` existe, es client component con `useState` para niño seleccionado, renderiza layout del maqueta `pantallas/resumen-dia.dc.html:42-71` (chips, hero, 3 métricas, ánimo, "Lo más lindo") — ok: archivo en repo (285 líneas), `"use client"`, `useState` para `selectedChildId`, chips condicional `children.length > 1 ? (...) : null`, hero gradient `bg-[linear-gradient(160deg,#FBE0D2,#F9D2DE)]` con "RESUMEN DEL DÍA / El día de {nombre} / {fecha}", 3 tarjetas métricas (comidas/siesta/momentos), card de ánimo "Ánimo del día", sección "LO MÁS LINDO DE HOY" con highlights (top 2 por fecha + `childIds`).
- [x] `components/shared/FamilySidebar.tsx` apunta el ítem "Resumen del día" a `/resumen` — ok: `NAV_ITEMS` (líneas 20-24): `{ id: "summary", label: "Resumen del día", icon: SunIcon, href: "/resumen", section: "summary", enabled: true }`.
- [x] Como `zeionsoft@gmail.com` (parent con `parent_children` de Darcy), `/familiar` muestra los posts donde `post_children.child_id = Darcy.id` + los posts con `post_children` vacío (ANUNCIO seed). `browser_console_messages level=error` → 0. Screenshot `.mcp-playwright/spec-20-family-feed.png` — ok: Playwright session con `zeionsoft@gmail.com` → `/familiar`. `browser_console_messages level=error` = 0 mensajes. `document.querySelectorAll('article').length = 3`: [Anuncio general "anuncio prueba", Darcy ACTIVIDAD "prueb Dárcy", Anuncio general "El viernes salimos al parque por la mañana. Recuerden mandar gorra y una botellita de agua."]. Screenshots: `.mcp-playwright/spec-20-family-feed-desktop.png` (top), `.mcp-playwright/spec-20-family-feed-mid.png` (Darcy post), `.mcp-playwright/spec-20-family-feed-bottom.png` (ANUNCIO seed al final).
- [x] Como `zeionsoft@gmail.com`, `/familiar` con 0 posts (mock vacío) muestra el empty state "Aún no hay publicaciones de tus peques." en lugar de la lista vacía. Screenshot `.mcp-playwright/spec-20-family-feed-empty.png` — ok: tras `insert post_children (anuncio→André)` x2 + `delete post_children (Darcy→actividad)`, `select count(*) from posts` con JWT zeionsoft = 0. Recarga `/familiar`: `browser_console_messages level=error` = 0, screenshot `.mcp-playwright/spec-20-family-feed-empty.png` muestra icono Sun + "Aún no hay publicaciones de tus peques." + divider `PUBLICADO HOY` bien separado. **DB restaurada** post-screenshot: `delete post_children ... announcements→André` + `insert post_children ... Darcy→actividad`; verificación final = 3 posts visibles de nuevo.
- [x] Como `zeionsoft@gmail.com`, `/resumen` carga sin errores; muestra los chips de los hijos del padre + empty state tipado de summary (tabla `daily_summaries` vacía). Screenshot `.mcp-playwright/spec-20-family-summary.png` — ok: Playwright session con zeionsoft → `/resumen`. `browser_console_messages level=error` = 0. Screenshot `.mcp-playwright/spec-20-family-summary-desktop.png` muestra: sidebar "Resumen del día" activo; hero "RESUMEN DEL DÍA / El día de Darcy / Domingo, 4 de octubre"; empty state "Mañana habrá mucho más que ver ✨ / La maestra todavía no ha contado cómo ha ido el día. En cuanto lo haga, aparecerá aquí."; sección "LO MÁS LINDO DE HOY" con "Todavía no hay momentos destacados del día." **Nota:** con 1 solo hijo vinculado (Darcy), el componente no muestra chips por diseño (`children.length > 1 ? <chips> : null`); el spec lo permite ("si hay 1 solo, no se muestran chips"), por lo que el criterio queda satisfecho.
- [x] Como `staff@opendaycare.com`, `/` (regression) sigue cargando con los 3 posts seed (LOGRO + ACTIVIDAD + ANUNCIO) y SIN cambios visuales respecto a `screenshots/feed.png`. `browser_console_messages level=error` → 0 — ok: Playwright session con staff → `/`. `browser_console_messages level=error` = 0. `document.querySelectorAll('article').length = 9` (3 seed + 6 añadidos manualmente para tests; el spec pedía "sin cambios visuales respecto a a `screenshots/feed.png`", y el layout — sidebar con "Nueva publicación / Feed / Niños / Avisos / Mi cuenta", header "GUARDERÍA · SALA SOLES / Buenas, Caro / martes 17 jun", compose box "Comparte un momento…", divider `PUBLICADO HOY`, `PostCard` con header de autor/tag — es idéntico). Screenshot `.mcp-playwright/spec-20-staff-feed-regression-desktop.png`.
- [x] Security audit con `set local role parent; select * from posts where id NOT IN (get_feed_for_parent);` → 0 filas. `set local role parent; select * from post_children where child_id NOT IN (select child_id from parent_children where parent_id = auth.uid());` → 0 filas — ok: con JWT simulado de zeionsoft (`role='parent'`, `daycare_id=a528...`), `select count(*) from posts where id NOT IN (get_feed_for_parent(zeionsoft_id, daycare_id))` = **0**. `select count(*) from post_children where child_id NOT IN (select child_id from parent_children where parent_id = auth.uid())` = **0**. Bonus: `count(*)` de posts visibles a zeionsoft = 3; `count(*)` de posts visibles a staff = 9 (regresión staff OK).
- [x] `npm run lint` exit 0. `npm run build` exit 0 — ok: `npm run lint` exit 0 sin warnings ni errores. `npm run build` exit 0; rutas generadas incluyen `/resumen` (Server Component dinámica) + `/familiar` (dinámica) + `/` (dinámica).

## Decisions

- **Sí:** filtrar el feed familiar incluyendo posts con `post_children` vacío (anuncios / "toda la sala"). Razón: el usuario quiere que el padre vea posts que afectan a su hijo aunque no estén dirigidos solo a él (excursiones, cierres, etc.). Mismo razonamiento que `listFeedPosts()` del staff abre todo.
- **Sí:** endurecer RLS de `posts` y `post_children` con branching por rol desde JWT. Razón: defense in depth — un padre con acceso SQL directo (devtools, supabase client con anon key) no debe poder SELECTear posts ajenos. La lógica de filtrado queda en un solo sitio (policy) y el código de la app solo consume lo permitido.
- **Sí:** crear un RPC `public.get_feed_for_parent(uuid, uuid)` en la DB. Razón: encapsula la lógica de filtrado en SQL nativo (más performante que filtrar en JS tras una query grande), y coincide 1:1 con la policy de RLS — si alguien cambia uno, hay que cambiar el otro; documentado en la migración como "defense in depth". El RPC devuelve solo IDs; la query principal hace los joins por `in.(...)` y reutiliza los helpers existentes (`PostRow`/`PostChildRow`/etc).
- **Sí:** tabla `daily_summaries` persistida (no calculada on-the-fly agregando `posts`). Razón: el schema de referencia lo dice explícitamente ("Para una clase, la tabla guardada es más fácil de demostrar") y los campos (`mood`, `highlight`) son texto libre de la maestra, no derivados. Mantiene el modelo editable en una segunda fase.
- **Sí:** sin seed de `daily_summaries` en la migración 20. Razón: el spec no incluye writer desde la app; la tabla vacía es el estado natural. Spec futuro creará el writer de staff + seed opcional.
- **Sí:** prop `emptyState?: ReactNode` en `FeedPageClient` (extensión mínima del contrato actual). Razón: ya tiene el slot `{children}` y un default de `header`; añadir un slot para empty state sigue el mismo patrón (declarativo, sin parametrización adicional). Mantiene backward compatibility.
- **Sí:** nueva ruta `/resumen` en `app/(family)/`, no `/resumen-dia`. Razón: el sidebar ya tiene `href="resumen-dia.dc.html"` en la maqueta, pero el path de la app debe ser en español coherente con `/familiar`. Se actualiza el sidebar al implementar.
- **Sí:** la query del feed del staff (`listFeedPosts()` sin sufijo) sigue intacta. Razón: SPEC 16 la cubre y la regresión visual del staff feed es un criterio explícito. Solo añadimos una nueva función `listFeedPostsForParent`.
- **No:** mover `<FeedProvider>` ni tocar `FeedContext`/`NewPostModal`/`PostCard`. Razón: la creación sigue siendo exclusiva del staff; este spec es de lectura para el padre.
- **No:** chips de filtro familiar ("Mateo", "Sofía", "Todos") en el feed. Razón: scope creep. Los chips sí entran en `/resumen` (maqueta `resumen-dia.dc.html:45-47` los tiene) pero son sobre el summary, no sobre el feed. Spec futuro para los del feed.
- **No:** incluir writer de `daily_summaries` en este spec. Razón: la maestra no escribe nada en la app en esta fase; el padre solo lee. Cuando llegue el writer, será otro spec con su Server Action.
- **No:** incluir likes, comentarios, reacciones en este spec. Razón: las tablas existen en schema pero ninguna app las persiste ni las muestra. Spec futuro separado.
- **No:** incluir paginación del feed. Razón: los posts del día caben en una pantalla; si el feed crece se aborda cuando sea un problema real.
- **No:** mover `listFeedPosts()` a una capa compartida que reciba el role. Razón: dos funciones explícitas (`listFeedPosts` / `listFeedPostsForParent`) son más legibles y cada una tiene su query optimizada para su audiencia. Si en el futuro se duplica lógica, refactorizamos; hoy YAGNI.

## Risks

| Risk | Mitigation |
| --- | --- |
| Recursión en policy `posts` ↔ `post_children` ↔ `parent_children` | La policy de `parent_children` (SPEC 11) ya filtra por `auth.uid()`, así que el JOIN desde `posts` solo ve filas propias. Verificación: `set local role parent` + query cross-tenant debe devolver 0 filas. Si hubiera recursión, replicamos el bypass `security definer` que SPEC 11 ya aplica. |
| Cambio de policy abierta → policy con branching rompe queries existentes del staff | La rama `role='staff'` y `role='admin'` se evalúa primero con `coalesce(...) = 'staff'`. Verificamos con `set local role staff` que el staff sigue viendo todo el daycare. |
| Cambio de policy rompe `createPostAction` (SPEC 16) | `createPostAction` inserta con rol staff, que sigue cubierto por las policies `posts_insert_staff` y `post_children_modify_author` (no se tocan). Verificamos manualmente publicando un post desde el modal staff. |
| RPC `get_feed_for_parent` desincronizado con la policy | Comentario en ambas: "keep in sync with posts_select_parent_or_staff_same_daycare". Verificación: tests manuales con `set local role` muestran el mismo set de posts desde la query directa y desde el RPC. |
| Empty state rompe el layout (altura 0, divider pegado arriba) | El empty state tiene `py-8` o equivalente con texto + icono, suficiente altura. Verificación visual obligatoria en acceptance. |
| Fecha Europe/Madrid vs UTC en `daily_summaries.date` y en la query | La query usa `to_char((now() at time zone 'Europe/Madrid'), 'YYYY-MM-DD')` para "hoy" en el servidor; la columna `date` es tipo `date` (sin zona). En inserts futuros (spec del writer) misma convención. Documentado en la migración. |
| `daily_summaries` vacía en producción → padre ve "no hay resumen" constantemente | Aceptable para esta fase; el writer de staff llega en un spec posterior. UI muestra empty state tipado, no error. Documentado en "Out of scope" y "Decisions". |
| Sidebar `href` actualizado pero el cache del browser sigue apuntando al viejo | Tras el cambio, el primer redirect tras sign-in de un padre fuerza refresh. Build con Turbopack no cachea HTML estático para `/resumen`. |
| `parent_children` policy actual (SPEC 11) usa `current_setting('request.jwt.claims', true)::jsonb` para leer role — mismo helper que las policies nuevas | Usamos `auth.jwt() ->> 'app_metadata' ->> 'role'` consistentemente. Si en el futuro se cambia el helper, las policies deben actualizarse todas juntas — documentado en la migración con comentario al inicio. |

## What is **not** in this spec

- Chips de filtro familiar ("Mateo", "Sofía", "Todos") en el feed.
- Crear/editar `daily_summaries` desde la app (la maestra aún no escribe el resumen).
- Likes, comentarios, reacciones.
- Paginación del feed.
- Formato de fecha localizado del feed.
- Cambios en `listFeedPosts()` (staff).
- Cambios en `FeedPageClient`, `FeedContext`, `NewPostModal`, `PostCard`.
- Tests automatizados.

Cada uno, si llega, va en su propio spec.