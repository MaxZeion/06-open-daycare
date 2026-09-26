# SPEC 08 — Tablas fundación `daycares` y `rooms` con seed

> **Status:** Aprovado
> **Depends on:** —
> **Date:** 2026-09-26
> **Objective:** Crear las tablas fundación `daycares` y `rooms` en Supabase, versionadas como migración SQL en el repo y aplicadas con el MCP, sembrando "Guardería Sala Soles" con 4 salas (Soles, Lunas, Estrellas, Mariposas) y dejando RLS activo con policies restrictivas compatibles con multi-tenant.

## Why this spec exists

El docs (`../07-DB-Schema`) define 13 tablas en orden de dependencias. `daycares` es la raíz; `rooms` es su primer hijo y la única referencia que necesita la tabla `children` (siguiente en la cadena). Sin estas dos tablas el resto del modelo no se puede sostener. Además, la maqueta `pantallas/feed.dc.html` y `pantallas/ninos.dc.html` ya mencionan la sala "Soles", así que la app espera que esta fila exista en cuanto se conecte a DB.

Crear ambas tablas juntas, con su contenido mínimo, evita un spec huérfano de "primera tabla vacía" y deja un terreno andado para el siguiente spec (`users`).

## Scope

**In:**

- Archivo `supabase/migrations/<timestamp>_create_daycares_and_rooms.sql` con:
  - `create extension if not exists pgcrypto schema extensions;` (defensivo: ya está instalada en el proyecto, pero el archivo queda portable).
  - `create table public.daycares (id uuid pk default gen_random_uuid(), name text not null, created_at timestamptz not null default now())`.
  - `create table public.rooms (id uuid pk default gen_random_uuid(), daycare_id uuid not null references public.daycares(id) on delete cascade, name text not null, created_at timestamptz not null default now())`.
  - Índice `create index rooms_daycare_id_idx on public.rooms(daycare_id)` (para acelerar joins/filtrado multi-tenant).
  - `alter table ... enable row level security` en ambas.
  - Policies restrictivas (ver "Policies" más abajo).
  - Seeds: una fila en `daycares` (`name = 'Guardería Sala Soles'`) y cuatro filas en `rooms` (`Soles`, `Lunas`, `Estrellas`, `Mariposas`) con `daycare_id` apuntando a la fila anterior.
- Aplicar la migración con el MCP: `apply_migration` con `name: "create_daycares_and_rooms"` y el mismo SQL.
- Verificación desde el MCP (queries de lectura; el INSERT inicial corre en la propia migración bajo el rol postgres que bypasea RLS).
- Documentar en el spec cómo revertir (down-migration manual con `drop table`) para uso futuro; **no se incluye el down en el archivo versionado** (Supabase CLI no lo usa por convención).

**Out of scope (para specs futuros):**

- Tablas `users`, `children`, `parent_children`, `invitations`, `posts`, `post_children`, `post_photos`, `reactions`, `comments`, `daily_summaries`, `devices`.
- `updated_at` y su trigger. Ni `daycares` ni `rooms` lo necesitan todavía.
- `unique (daycare_id, name)` en `rooms`. Aceptable que haya dos salas con el mismo nombre en la misma daycare (poco probable, pero no lo bloqueamos de inicio).
- Auth real, sign-up, sign-in, JWT, claims, sign-in con magic link.
- Multi-tenant estricto (cada usuario solo ve su daycare). Las policies de hoy son compatibles con esa evolución (basta endurecer `using` cuando llegue `users`).
- Triggers `AFTER INSERT ON auth.users`, `SECURITY DEFINER`, nada en `auth` schema.
- Enums (`post_type`, `child_status`, `user_role`, `user_status`, `relationship_type`, `invitation_status`). Aparecen cuando lleguen las tablas que los usan.
- Seeds adicionales (otros usuarios, niños, posts). Solo las 4 salas fundación.
- Edge Functions, Storage, Realtime, RLS fina por rol.
- `supabase/seed.sql` separado. Los seeds viajan en la migración.

## Data model

```sql
-- supabase/migrations/<timestamp>_create_daycares_and_rooms.sql

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

-- policies (ver "Policies" abajo)
create policy "daycares_select_authenticated"
  on public.daycares for select
  to authenticated
  using (true);

create policy "rooms_select_authenticated"
  on public.rooms for select
  to authenticated
  using (true);

-- seeds (corren bajo rol postgres, bypasean RLS)
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
```

Convenciones:

- `pgcrypto` ya está instalada (`extensions.pgcrypto`). El `create extension` del archivo es defensivo (idempotente con `if not exists`) y deja el archivo portable a un proyecto Supabase recién creado.
- Los nombres de sala viven en español porque son contenido visible de la UI. El `name` en DB es la fuente de verdad; la UI no los traduce.
- `daycare_id uuid not null references ... on delete cascade`: si se borra la daycare, sus salas se borran con ella. Coherente con el docs (la sala no existe sin guardería).
- Índice en `rooms.daycare_id` porque todo lookup de "salas de mi guardería" va por ahí.
- `returning id` en el primer `insert` solo para registrar en logs (Supabase lo descarta si no hay cliente que lo lea).

## Policies (decisión cerrada: restrictivas)

- `select` abierto a `authenticated` (lectura desde la app logueada).
- `insert`, `update`, `delete`: **sin policy** en `anon` ni `authenticated`. Sin policy = RLS bloquea. Toda escritura pasa por:
  - Migraciones SQL (rol postgres del MCP), o
  - service_role (futuro: jobs admin, Edge Functions).
- `anon` no tiene ninguna policy. El feed público pre-login (si lo hay) no lee de estas tablas; usa mocks (SPEC 01).
- Endurecimiento futuro: cuando llegue el spec de `users`/`auth`, las `select` se sustituyen por `using (auth.jwt() ->> 'daycare_id' = daycares.id::text)` y la equivalente en `rooms`. La forma actual es compatible con esa sustitución.

## Implementation plan

1. Crear la carpeta `supabase/migrations/` en el repo.
2. Crear el archivo `supabase/migrations/<timestamp>_create_daycares_and_rooms.sql` con el SQL del Data model.
3. Aplicar con el MCP: `apply_migration` con `name: "create_daycares_and_rooms"` y `query` = contenido del archivo. Verificar `success: true`.
4. Verificar desde el MCP:
   - `list_tables` muestra `public.daycares` y `public.rooms` con sus columnas y PK.
   - `select id, name from public.daycares` → 1 fila (`Guardería Sala Soles`).
   - `select name from public.rooms order by name` → 4 filas (`Estrellas`, `Lunas`, `Mariposas`, `Soles`).
   - `select count(*) from public.daycares` → 1; `select count(*) from public.rooms` → 4.
   - `select relname, relrowsecurity from pg_class where relname in ('daycares','rooms')` → ambas con `t`.
   - `select polname, polcmd from pg_policy where polrelid in ('public.daycares'::regclass, 'public.rooms'::regclass)` → 2 policies (`select` en cada tabla).
5. Confirmar que el archivo del repo y la migración aplicada no tienen drift (mismo SQL que el aplicado).
6. `npm run lint` y `npm run build` siguen verdes (no se toca código de la app).
7. Commit + PR en la rama del spec (`spec-08-daycares-and-rooms-seed`).

### Acceptance criteria

- [ ] Existe `supabase/migrations/<timestamp>_create_daycares_and_rooms.sql` commiteado y contiene el SQL del Data model.
- [ ] `apply_migration` con nombre `create_daycares_and_rooms` devuelve `success: true` (sin errores en la respuesta del MCP).
- [ ] `list_tables` muestra `public.daycares` con columnas `id uuid`, `name text`, `created_at timestamptz`; PK `id`. Muestra `public.rooms` con columnas `id uuid`, `daycare_id uuid`, `name text`, `created_at timestamptz`; PK `id`.
- [ ] `pg_class` reporta `relrowsecurity = true` para `daycares` y `rooms`.
- [ ] `pg_policy` lista exactamente 2 policies: `daycares_select_authenticated` (cmd `r`) y `rooms_select_authenticated` (cmd `r`). Ninguna policy de `insert/update/delete`.
- [ ] `select id, name from public.daycares` devuelve **una** fila: `Guardería Sala Soles`.
- [ ] `select name from public.rooms order by name` devuelve **cuatro** filas: `Estrellas`, `Lunas`, `Mariposas`, `Soles`.
- [ ] Las 4 filas de `rooms` tienen el mismo `daycare_id`, igual al `id` de la fila de `daycares`.
- [ ] Existe el índice `rooms_daycare_id_idx` sobre `public.rooms(daycare_id)` (`\d public.rooms` lo lista o `pg_indexes` lo confirma).
- [ ] `select * from public.daycares` ejecutado por `anon` devuelve **0 filas** (sin policy `select` para `anon`).
- [ ] `select * from public.daycares` ejecutado por `authenticated` devuelve **1 fila** (policy `select` abierta).
- [ ] El archivo del repo y el SQL aplicado por el MCP son idénticos (sin drift).
- [ ] `npm run lint` y `npm run build` pasan sin errores (no se modificó código de la app).

## Decisions

- **Sí:** crear `daycares` + `rooms` en el mismo spec. El docs las pone seguidas en la cadena de dependencias; hacerlas juntas evita un spec huérfano.
- **Sí:** nombres de salas en español (`Soles`, `Lunas`, `Estrellas`, `Mariposas`). Son contenido visible; la UI no los traduce.
- **Sí:** 1 daycare con 4 salas (FK 4→1), no 4 daycares con 1 sala cada una. Coincide con el docs y con la maqueta actual.
- **Sí:** seed dentro de la misma migración. Es la unidad lógica; reproducible sin paso manual.
- **No:** `updated_at`. Ni `daycares` ni `rooms` lo necesitan todavía; se añade cuando llegue un caso real (probablemente con `users` o `posts`).
- **No:** `unique (daycare_id, name)`. Mantiene flexibilidad (dos salas con el mismo nombre en la misma daycare no es un caso real que bloqueemos hoy).
- **Sí:** índice en `rooms.daycare_id`. Toda query multi-tenant va por ahí.
- **Sí:** `on delete cascade` en `rooms.daycare_id`. Una sala sin daycare no tiene sentido.
- **Sí:** policies restrictivas (decidido por el usuario). `select` para `authenticated`, sin policies de escritura. Compatible con evolución a multi-tenant estricto.
- **Sí:** `create extension if not exists pgcrypto schema extensions` defensivo en el archivo. Idempotente; portable a un proyecto Supabase recién creado.
- **No:** `supabase/seed.sql` separado. Los seeds viven en la migración para garantizar reproducibilidad.
- **No:** down-migration versionada. Supabase CLI no la ejecuta por defecto y mantenerla en sync con la up es trabajo sin valor hoy.
- **No:** `triggers set_updated_at` (consistente con no tener la columna).

## Risks

| Risk | Mitigation |
| --- | --- |
| `anon` no tiene policy `select`: cualquier llamada pública a `daycares`/`rooms` devuelve 0 filas y puede parecer un bug | La UI actual (SPEC 01) usa mocks, no DB. El bloqueo solo se nota cuando se enchufe la primera pantalla a Supabase; ese spec traerá su propio cliente con `anon key`. Documentado en el header del archivo. |
| Drift entre el archivo del repo y la DB si alguien edita la tabla a mano | El criterio "archivo == migración aplicada" se valida en `/spec-verify`. |
| `create extension if not exists` falla si el rol del MCP no tiene privilege sobre `extensions` | Mitigación: lo dejamos dentro de la migración como `do $$ begin ... exception when insufficient_privilege then null; end $$` si la verificación falla; ajustar en el spec-verify. |
| Nombres de sala duplicados por error humano futuro | Aceptable: el docs no exige uniqueness. Si llega el caso, se añade `unique (daycare_id, name)` en un spec posterior. |
| Multi-tenant estricto llega más tarde y exige reescribir policies | Las policies actuales son un subconjunto compatible: basta reemplazar `using (true)` por `using (auth.jwt() ->> 'daycare_id' = daycares.id::text)` (y la equivalente en `rooms`). No se rompe nada en el ínterin. |

## What is **not** in this spec

- Cualquier otra tabla del docs (`users`, `children`, `parent_children`, `invitations`, `posts`, `post_children`, `post_photos`, `reactions`, `comments`, `daily_summaries`, `devices`).
- Enums (`post_type`, `child_status`, `user_role`, `user_status`, `relationship_type`, `invitation_status`).
- Auth, sign-up, sign-in, magic link, JWT claims, multi-tenant estricto.
- `updated_at` y triggers asociados.
- Policies de `insert/update/delete`. Escritura solo via migraciones o service_role.
- Edge Functions, Storage, Realtime.
- `supabase/seed.sql` separado.
- Down-migration versionada.

Cada una de esas, si llega, va en su propio spec.
