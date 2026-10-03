# SPEC 16 — Publicaciones del staff: reales en DB con RLS restrictiva

> **Status:** Aprobado
> **Depends on:** SPEC 07 (modal `NewPostModal` + `FeedContext` + `PostKind` 7 valores + `buildRecipient`), SPEC 09 (`users` con `role` + enums), SPEC 10 (login real + `getClaims` + `getCurrentUser`), SPEC 11 (children reales + Server Actions en `/kids` + selector de salas), SPEC 13/14/15 (auth trigger endurecido + recovery)
> **Date:** 2026-10-03
> **Objective:** Sustituir los posts en memoria de SPEC 07 por publicaciones reales en Supabase, con la restricción de que solo el staff puede insertar (forzada en RLS) y con subida de fotos a una carpeta local `public/uploads/posts/`.

## Why this spec exists

SPEC 07 dejó la UI completa de creación y visualización, pero los posts viven en `FeedContext` (memoria, mueren al refrescar). La capa de datos del proyecto ya tiene `daycares / rooms / users (con role) / children`, así que la pieza que falta es la tabla `posts` y su modelado. Este spec la trae a la realidad con la regla de negocio más sensible explícita en la DB: **solo staff publica**. Endurecer en RLS — no solo en la UI — para que un padre con la cookie correcta no pueda saltarse la restricción.

## Scope

**In:**

- Migración `supabase/migrations/16-create_posts_related_tables.sql`:
  - Ampliar el enum `post_type` con el valor `mood` (el SPEC 07 añadió la píldora ÁNIMO al UI; el esquema no la contemplaba).
  - Crear `posts`, `post_children` (PK compuesta `post_id`+`child_id`) y `post_photos` con columnas, FK, defaults y RLS:
    - `posts` SELECT: usuarios autenticados del mismo `daycare_id` que el autor (EXISTS contra `users`).
    - `posts` INSERT: solo si `author_id = auth.uid()` y el usuario actual tiene `role = 'staff'` y `status = 'active'`.
    - `posts` UPDATE / DELETE: solo el autor.
    - `post_children` SELECT abierto a `authenticated`; INSERT/DELETE solo si el `post` pertenece al autor y es staff.
    - `post_photos` SELECT abierto a `authenticated`; INSERT/DELETE solo si el `post` pertenece al autor y es staff.
  - Seed fundación: 3 posts de ejemplo análogos a los 3 mocks de SPEC 01 (LOGRO + ACTIVIDAD + ANUNCIO) autoría del staff seed de SPEC 09; el ACTIVIDAD incluye un `post_photo` real (placeholder) con archivo en `public/uploads/posts/seed/`.
- Server Action `createPostAction(formData)` (`app/actions/posts.ts`): valida sesión y rol en servidor; inserta `posts` + `post_children` + `post_photos`; para cada foto escribe a `public/uploads/posts/<uuid>.<ext>` con `fs/promises`; `revalidatePath('/')`.
- Helper `listFeedPosts()` (`utils/supabase/posts.ts`): query con join a `post_children.children` y a `post_photos`, ordenada por `published_at DESC`, filtrada por `daycare_id` del usuario actual; transforma al shape que consume `PostCard` (deriva `author` del primer hijo o "Anuncio general" + `recipient` con `buildRecipient`).
- `NewPostModal`: el botón "Publicar" deja de llamar a `publish()` del contexto y pasa a `<form action={createPostAction}>`; la sección FOTOS pasa de decorativa a funcional con `<input type="file" multiple>` (preview de archivos seleccionados, subida real al servidor, límite 5 / 5MB / image/*).
- `PostCard`: añade bloque de foto real cuando `post.photos.length > 0` (`<img src=...>` con `object-cover`); conserva el placeholder dashed si no hay fotos (maqueta sin foto).
- `FeedContext` simplificado: solo `modalOpen`, `openModal`, `closeModal`. Sin estado de posts.
- `app/page.tsx`: pasa a Server Component, llama a `listFeedPosts()` y pasa la lista a un wrapper client mínimo (porque el FAB y la caja del feed siguen abriendo el modal).

**Out of scope (para specs futuros):**

- Reacciones y comentarios (tablas del esquema destino; van en spec propio con sus policies).
- Feed de la familia (`/family/feed` con `familia-feed.dc.html`); este spec solo afecta a la vista staff `/`.
- Subida a Supabase Storage. La carpeta local `public/uploads/posts/` es un bucket propio del proyecto.
- Reescalar / comprimir fotos en cliente o servidor.
- Edición / borrado de posts desde la UI (la policy DELETE existe pero no se invoca).
- Likes y contadores reales.
- Optimistic updates del feed: el `revalidatePath` recarga tras publicar; sin skeleton ni estado intermedio.

## Data model

### DB (Postgres)

```sql
-- 1) Enum
ALTER TYPE post_type ADD VALUE 'mood';

-- 2) posts
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete restrict,
  room_id   uuid references public.rooms(id) on delete set null,
  type      public.post_type not null,
  title     text,
  body      text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_published_at_idx on public.posts (published_at desc);
create index posts_author_id_idx on public.posts (author_id);
create index posts_room_id_idx on public.posts (room_id) where room_id is not null;

-- 3) post_children
create table public.post_children (
  post_id  uuid not null references public.posts(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  primary key (post_id, child_id)
);
create index post_children_child_id_idx on public.post_children (child_id);

-- 4) post_photos
create table public.post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  url text not null,
  width int,
  height int,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index post_photos_post_id_idx on public.post_photos (post_id, position);
```

### RLS

```sql
alter table public.posts enable row level security;
alter table public.post_children enable row level security;
alter table public.post_photos enable row level security;

-- posts: SELECT para usuarios del mismo daycare que el autor
create policy "posts_select_same_daycare"
on public.posts for select to authenticated
using (
  exists (
    select 1
    from public.users me
    join public.users author on author.id = posts.author_id
    where me.id = auth.uid() and me.daycare_id = author.daycare_id
  )
);

-- posts: INSERT solo staff del mismo daycare, autor = uno mismo
create policy "posts_insert_staff"
on public.posts for insert to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.users
    where id = auth.uid() and role = 'staff' and status = 'active'
  )
);

-- posts: UPDATE / DELETE solo el autor
create policy "posts_modify_author"
on public.posts for all to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

-- post_children: SELECT abierto a authenticated
create policy "post_children_select_authenticated"
on public.post_children for select to authenticated using (true);

-- post_children: INSERT/DELETE/UPDATE solo si el post es del autor (staff)
create policy "post_children_modify_author"
on public.post_children for all to authenticated
using (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
)
with check (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
);

-- post_photos: igual que post_children
create policy "post_photos_select_authenticated"
on public.post_photos for select to authenticated using (true);
create policy "post_photos_modify_author"
on public.post_photos for all to authenticated
using (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
)
with check (
  exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
);
```

### Seed (dentro de la misma migración)

3 posts autoría del staff seed (id se obtiene con `select id from public.users where role='staff' limit 1` y se pasa a variable en PL/pgSQL). Cada `post_children` apunta a un `child_id` real de la seed de SPEC 11. El ACTIVIDAD lleva un `post_photos` con URL `/uploads/posts/seed/seed-actividad.jpg` (placeholder gráfico en `public/uploads/posts/seed/`).

### App (TypeScript)

```ts
// utils/supabase/posts.ts
export interface FeedPost {
  id: string;
  author: { name: string; initials: string; bg: string; fg: string }; // hijo o "Anuncio general"
  time: string;            // HH:MM (es-ES, Europe/Madrid)
  publishedBy: string;     // "publicado por ti" si es el viewer, si no, "Maestra Caro · Sala Soles"
  kind: PostKind;          // viene de la DB mapeado: mood → animo
  recipient: string;       // vía buildRecipient
  body: string;
  photos: { url: string; width?: number; height?: number }[];
  likes: number;           // placeholder 0; reactions en otro spec
  comments: number;        // placeholder 0; comments en otro spec
}

export async function listFeedPosts(): Promise<FeedPost[]>;
```

```ts
// app/actions/posts.ts
"use server";
export async function createPostAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>;
```

```ts
// app/lib/uploads.ts
export async function savePhotoToBucket(file: File): Promise<{ url: string }>;
// - valida mime image/* y tamaño ≤ 5MB
// - genera nombre con crypto.randomUUID() + ext por mime
// - escribe a public/uploads/posts/<uuid>.<ext> con fs/promises
// - devuelve { url: "/uploads/posts/<uuid>.<ext>" }
```

```ts
// components/feed/mockPosts.ts (mod)
// PostKind se queda igual: "comida" | "siesta" | "actividad" | "logro" | "animo" | "foto" | "anuncio".
// MAP_KIND (DB → UI) y MAP_KIND_UI_TO_DB (UI → DB) en utils/supabase/posts.ts; clave mood ↔ animo.
// POSTS seed se elimina; el feed se inicializa desde listFeedPosts() en el server component.
```

## Implementation plan

1. `supabase/migrations/16-create_posts_related_tables.sql`: DDL de las 3 tablas + `ALTER TYPE post_type ADD VALUE 'mood'` + índices + RLS + seed (3 posts + sus `post_children` + 1 `post_photos` con archivo `public/uploads/posts/seed/seed-actividad.jpg`).
2. Aplicar la migración con `apply_migration` del MCP. Verificar con `list_tables` (RLS on, FK correctas), `pg_policy` (nº y tipo), conteos (3 posts tras seed).
3. Generar tipos TS: `supabase_generate_typescript_types` del MCP → `types/supabase.ts` (overwrite).
4. `public/uploads/posts/.gitkeep` y `public/uploads/posts/seed/seed-actividad.jpg` (placeholder gráfico de 1200×800, color crema/terracota).
5. `app/lib/uploads.ts`: helper `savePhotoToBucket(file)` (fs/promises; tipos MIME `image/jpeg|png|webp|gif`; 5MB máx; escribe a `public/uploads/posts/`).
6. `utils/supabase/posts.ts`: tipos `FeedPost`, mapping `MAP_KIND` (DB → UI) y `MAP_KIND_UI_TO_DB`, `listFeedPosts()` (Supabase server client + select con `post_children:child_id(children(*))` y `post_photos(*)`).
7. `app/actions/posts.ts` Server Action `createPostAction(formData)`:
   - `getCurrentUser()` (helper existente de SPEC 10) — abort si null o no staff.
   - Parse `kind`, `body`, `childIds[]`, `allRoom`, `files[]`.
   - Validaciones (≥1 niño o allRoom, body no vacío, ≤5 fotos, cada foto ≤5MB).
   - Insert `posts` con `author_id`, `type = MAP_KIND_UI_TO_DB[kind]`, `body`, `published_at = now()`. Captura el id.
   - Si `childIds.length > 0`, insert `post_children` por cada `child_id`.
   - Por cada file: `savePhotoToBucket(file)` → insert `post_photos` con `position` secuencial.
   - `revalidatePath('/')`. Devuelve `{ ok: true }`.
8. `components/feed/mockPosts.ts`: eliminar `POSTS` (o dejarlos en `legacyPosts.ts`); `KIND_META` se queda (lo consume `PostCard`/`NewPostModal`). `PostKind` no cambia.
9. `components/feed/PostCard.tsx`:
   - `Post` ahora es `FeedPost`. Recibe `photos: { url, width?, height? }[]`.
   - Si `photos.length > 0`, render `<img src={photos[0].url} alt="" class="w-full rounded-2xl object-cover">` con altura máxima y `aspectRatio` si hay `width`/`height`.
   - Si 0 fotos, mantiene el bloque placeholder dashed (idéntico a SPEC 07).
10. `components/feed/FeedContext.tsx`: quita `posts`, `publish`. Mantiene `modalOpen`, `openModal`, `closeModal`. (La interfaz `FeedContextValue` se simplifica en consecuencia.)
11. `components/feed/NewPostModal.tsx`:
    - La caja de FOTOS pasa a funcional: `<input type="file" multiple accept="image/*">` con preview de thumbnails, botón "Quitar" por foto, contador "N/5", estado local `pendingFiles: File[]`.
    - "Publicar" pasa a `<form action={createPostAction}>` con hidden inputs (`kind`, `body`, `childIds[]`, `allRoom`) y los `files` en `formData`. `useFormState` para `{ ok, error }` y mostrar inline el error (mismo patrón que SPEC 04/05/07). Reset al cerrar.
    - "Publicar" muestra `disabled={pending}` mientras el form está submitting; el modal se cierra cuando la action devuelve `{ ok: true }` (vía `useEffect`).
12. `app/page.tsx` (server):
    - `const posts = await listFeedPosts()`.
    - Render con `AppShell` + header + composer box (sigue abriendo modal) + divisor + `posts.map(PostCard)`.
    - Envuelve los hijos en un client wrapper para `FeedProvider` (porque sigue siendo client).
13. `components/shared/AppShell.tsx` / `Sidebar.tsx`: sin cambios funcionales (siguen consumiendo `useFeed()` para `openModal`).
14. `package.json` scripts: añadir `"typecheck": "tsc --noEmit"` si no existe (necesario para que `utils/supabase/posts.ts` valide tipos generados).
15. Verificar regresión: `/`, `/kids`, `/kids/[id]`, `/login`, `/activate` siguen renderizando con 0 errores. `npm run lint` y `npm run build` exit 0. Ejecutar el agente `db-security-auditor` sobre el spec.

## Acceptance criteria

- [ ] `npm run lint` y `npm run build` pasan sin errores. — TS estricto; tipos regenerados.
- [ ] `supabase_migrations.schema_migrations` contiene el registro `16_create_posts_related_tables` con `statements[]` byte-idéntico al archivo (módulo el newline final).
- [ ] `list_tables` muestra `public.posts`, `public.post_children`, `public.post_photos` con FKs correctas, RLS on, y los índices `posts_published_at_idx` / `posts_author_id_idx` / `post_children_child_id_idx` / `post_photos_post_id_idx`.
- [ ] `pg_enum` para `post_type` contiene los 7 valores: `meal, nap, activity, achievement, mood, photo, announcement`.
- [ ] `pg_policy` lista 6 policies nuevas (`posts_*` ×3, `post_children_*` ×2, `post_photos_*` ×2) con `cmd` correcto (`r`, `i`, `a`).
- [ ] Como `authenticated` con `role='staff'`, `insert` en `posts` con `author_id = auth.uid()` y `type='achievement'` succeed; con `author_id` distinto de `auth.uid()`, `insert` rejected (RLS).
- [ ] Como `authenticated` con `role='parent'`, `insert` en `posts` rejected (RLS, con cualquier `author_id`).
- [ ] Como `authenticated` con `role='staff'`, `update`/`delete` de un post propio succeed; de un post ajeno rejected.
- [ ] `select count(*) from posts` tras seed = 3; `select count(*) from post_photos` = 1; `select count(*) from post_children` ≥ 3 (1 por cada post de logro/actividad/anuncio).
- [ ] `listFeedPosts()` desde el server devuelve los 3 posts seed, cada uno con `recipient` correcto (`"familia de Mateo"`, `"familia de Mateo"`, `"toda la sala"`) y `time` en `HH:MM` Europe/Madrid.
- [ ] `app/` `/` renderiza los 3 posts seed desde la DB (no del contexto), con el mismo layout de SPEC 01 + el bloque de foto real (`<img>` 1200×800 servido desde `/uploads/posts/seed/`) en el ACTIVIDAD y los placeholders dashed en LOGRO y ANUNCIO.
- [ ] `NewPostModal`: al seleccionar ≥1 archivo en FOTOS aparecen thumbnails; al pulsar "Publicar" el form sube vía `createPostAction`; el modal cierra, el feed muestra el nuevo post al inicio con la imagen servida en `/uploads/posts/<uuid>.<ext>`.
- [ ] FOTOS valida: >5MB → error inline "La foto X supera 5MB"; 6 archivos → error "Máximo 5 fotos"; mime no imagen → error "Solo imágenes".
- [ ] `createPostAction` rechaza la publicación si el usuario no es staff (test con sesión `parent`): no se crea la fila en `posts` y la action devuelve `{ ok: false, error: 'No autorizado' }`.
- [ ] Regresión: `/`, `/kids`, `/kids/[id]`, `/login`, `/activate` con 0 errores de consola; `AddKidModal` y `LinkParentModal` siguen funcionando; el modal `NewPostModal` sigue abriendo desde los 3 disparadores (sidebar, FAB, composer box).
- [ ] El agente `db-security-auditor` corre sobre la migración 16 y emite **APROBADO** para RLS, índices y seeds.

## Decisions

- **Sí:** carpeta local `public/uploads/posts/` como bucket. Coherente con tu petición ("carpeta interna exclusiva, sin Supabase Storage"). Trade-off: no escala a multi-instancia (filesystem stateful), no hay CDN; para una guardería mono-instancia es lo más simple. URLs relativas `/uploads/posts/...` (servidas por Next.js).
- **Sí:** añadir `mood` al enum `post_type` y mapear desde la UI (ÁNIMO → `mood`). Cierra la desviación que dejó SPEC 07.
- **No:** `daycare_id` denormalizado en `posts`. RLS con EXISTS contra `users`. Consistente con `children.room_id` (que tampoco denormaliza `daycare_id`).
- **Sí:** `publishedBy` se calcula server-side: `"publicado por ti"` si el viewer es el autor; si no, `"<full_name> · Sala <room>"` (o el nombre del autor sin sala si es un anuncio sin `room_id`).
- **Sí:** `listFeedPosts()` corre en el Server Component y el feed se hidrata con datos reales; el `FeedContext` deja de tener `posts` (solo guarda el estado del modal). Justificación: SPEC 11 ya hace lo mismo con `children` (server fetch + context solo para UI ephemeral).
- **Sí:** Server Action para `createPost` (no API route). Patrón fijado en SPEC 04/05/11. `revalidatePath('/')` tras éxito.
- **Sí:** FOTOS funcional con `<input type="file" multiple>`. Límite 5 fotos / 5MB / `image/*`. Sin reescalado en cliente (lo evitamos por ahora).
- **Sí:** `PostCard` renderiza `<img>` real cuando hay fotos; placeholder dashed cuando no. Coherente con tu respuesta ("Card renderiza <img> real"). `<img>` plano (no `next/image`) para esta primera integración con `public/`.
- **No:** optimistic updates. El `revalidatePath` recarga; sin skeleton, sin parpadeo. La maqueta no muestra estados intermedios en el feed al publicar.
- **No:** `reactions` ni `comments` (van en specs propios; los contadores en `FeedPost` quedan a 0).
- **No:** `daily_summaries`.
- **No:** borrar fotos del disco al borrar un post (la policy `DELETE` existe pero la UI no lo invoca; si se borra, queda el archivo huérfano — se aborda cuando llegue el spec de "borrar post").
- **No:** usar `next/image` con remote patterns — para esta fase `<img>` plano es suficiente (las URLs son locales y públicas).

## Risks

| Risk | Mitigation |
| --- | --- |
| Mismatch entre `PostKind` UI y `post_type` DB | Mapping central `MAP_KIND` (DB → UI) y `MAP_KIND_UI_TO_DB` (UI → DB) en `utils/supabase/posts.ts`; sin esto, ÁNIMO no persistiría. |
| RLS con EXISTS contra `users` por cada fila | Aceptable para el volumen esperado (decenas/cientos de posts por guardería). Si crece, evaluar denormalizar `daycare_id` con trigger. |
| `ALTER TYPE ... ADD VALUE` no se puede revertir dentro de la misma transacción | La migración ejecuta el ALTER como statement suelto antes de los CREATE (Postgres lo permite desde 12). Si falla, el enum queda con `mood` y hay que limpiar manualmente — verificar el orden de statements. |
| Subida concurrente a la misma carpeta | `crypto.randomUUID()` da nombres únicos. La creación del directorio es idempotente (`mkdir { recursive: true }`). |
| Fichero subido no se borra si la inserción en `post_photos` falla | Capturar el error en la action: si `post_photos` falla, intentar `fs.unlink` del archivo antes de devolver error. La inserción se hace en serie por simplicidad. |
| `apply_migration` no incluye `auth.uid()` en seeds | El seed de los 3 posts referencia el id del staff vía `(select id from users where role='staff' limit 1)`; si la staff seed cambia, el seed sigue siendo válido. |

## What is **not** in this spec

- Reacciones (tabla `reactions` + UI del corazón).
- Comentarios (tabla `comments` + UI del hilo).
- Feed de la familia (`/family/feed` con la maqueta `familia-feed.dc.html`).
- Subida a Supabase Storage.
- Reescalado / compresión de fotos (cliente ni servidor).
- Edición y borrado de posts desde la UI.
- Likes y contadores reales (placeholder a 0).
- Optimistic updates en el feed al publicar.
- `daily_summaries`.

Cada uno, si llega, va en su propio spec.