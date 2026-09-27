# SPEC 11 — Niños reales desde Supabase y salas con ribbon

> **Status:** Aprobado
> **Depends on:** SPEC 02 (listado/perfil), SPEC 04 (modal agregar niño), SPEC 05 (vincular padre), SPEC 07 (nueva publicación PARA), SPEC 08 (seed daycares+rooms), SPEC 10 (login y guards)
> **Date:** 2026-09-27
> **Objective:** Sustituir los mocks `KIDS` por datos reales: tabla `children` (migración `05`), selector de SALA desde `rooms`, alta real vía Server Action, `/kids` con chips de sala y ribbon numérico por sala, perfil `/kids/[id]` por UUID y los chips "PARA" del feed consumiendo niños de la BD.

## Why this spec exists

El `SALAS` del modal está hardcodeado y no coincide con la BD: la app ofrece "Soles, Lunas, Nubes, Estrellas", pero las rooms sembradas en SPEC 08 son **Soles, Lunas, Estrellas, Mariposas**. Además el listado de niños se pierde al recargar (state en memoria) y los perfiles usan slugs mock. Este spec cierra el ciclo con la BD: los niños se guardan, se leen y se organizan por sala, y la app queda libre de mocks.

## Scope

**In:**

- Migración nueva `supabase/migrations/05-create_children.sql`: enum `child_status`, tabla `children` (siguiendo el esquema objetivo de `../07-DB-Schema`), índice `children_room_id_idx`, RLS activado con 4 policies (`select/insert/update/delete` a `authenticated`) y **sin seed**.
- Eliminación de los mocks en `components/kids/mockKids.ts`: fuera `KIDS`, `SALAS`, `Sala` y `buildKidId`; se mantienen los tipos `Kid`/`Parent`/`AllergyTag` y `AVATAR_PALETTE` (feed y tarjetas los usan como tipos de UI).
- `/kids` pasa a Server Component con datos reales: `rooms` (orden `name`) + `children` activos. El divisor "SALA SOLES · N niños" se sustituye por **chips horizontales** (una por sala) con **ribbon numérico** (nº de niños activos en la sala). La URL se sincroniza con `?room=<uuid>`; por defecto la primera sala.
- `components/kids/RoomTabs.tsx` (nuevo): chips con ribbon; chip activo en terracota (`#FBE3D8`/`#D9583C`, mismo patrón que el sidebar).
- Buscador: filtra por nombre **solo dentro de la sala seleccionada**. Sala sin niños → estado vacío ("Aún no hay niños en esta sala").
- `AddKidModal`: el `<select>` de SALA consume las `rooms` de la BD vía props (value = id, label = name); default = la sala activa en `/kids`. Guardar vía Server Action `addKid` (`app/kids/actions.ts`): inserta en `children`, `revalidatePath('/kids')`, error en español si el insert falla, y "Guardar" en estado pending mientras se ejecuta.
- Perfil `/kids/[id]`: id pasa a UUID. Lectura real de `children` (validando formato UUID antes de la query). Datos formateados: `birth_date` → "12 mar 2022", `enrolled_at` → "feb 2025", `allergy_tags` → etiquetas MANÍ/LACTOSA, `medical_notes` → caja de notas. "Volver a Niños" vuelve a `/kids` conservando `?room=`. "Vincular" (SPEC 05) sigue siendo mock en memoria.
- Feed (SPEC 07): `app/page.tsx` obtiene los `children` activos y los pasa por props hasta `NewPostModal`; los chips PARA lista niños reales; si no hay niños, mensaje vacío; el toggle "Toda la sala" no cambia de semántica (aplica sobre los niños de la lista).
- Nuevo `components/kids/mapKid.ts`: conversión fila `children` → `Kid` (avatar por hash determinista del uuid sobre `AVATAR_PALETTE`, edad derivada de `birth_date`, tags → `allergy`, fechas formateadas), mapeo texto→tags (`maní`→`peanut`, `lactosa`→`lactose`) y `formatSpanishDate`.
- Regenerar `types/supabase.ts`. `npm run lint` y `npm run build` en verde.

**Out of scope (para specs futuros):**

- `parent_children`, `invitations` ni "Vincular padre" real (sigue en memoria).
- Edición, archivo (`status='archived'`) ni baja de niños en la UI.
- UI de `photo_consent` (default `true` en BD) ni fotos reales de niños (Storage).
- Endurecimiento RLS multi-tenant (`daycare_id` vía JWT).
- `post_children`: publicaciones del feed con niños persistidos en BD.
- Búsqueda cross-sala o filtros avanzados.

## Data model

`supabase/migrations/05-create_children.sql`:

```sql
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
```

Convenciones:

- `id` en la URL pasa a UUID; `buildKidId`/slugs desaparecen.
- `allergy_tags` en inglés (`{peanut}`, `{lactose}`); la UI traduce a MANÍ/LACTOSA (SPEC 06). Texto de alergias no reconocido se descarta.
- `birth_date` se persiste como `date` ISO (la máscara `dd/mm/aaaa` del modal se convierte antes del insert). La UI muestra "12 mar 2022" de forma unificada — resuelve el riesgo de formato mixto de SPEC 04.
- `room_id` nullable (esquema objetivo); la UI siempre exige SALA.
- Sin `updated_at`/trigger: no hay caso de uso de actualización de niños en este spec (llegará con `editar-nino` y su migración).

Tipos de UI (`components/kids/mockKids.ts`, tras limpiar los mocks):

```ts
export interface Kid {
  id: string;           // children.id (uuid)
  roomId: string;       // agrupación por sala (campo nuevo)
  name: string;         // full_name
  initials: string;
  avatar: { bg: string; fg: string }; // AVATAR_PALETTE[hash(uuid) % 5]
  age: number;          // derivado de birth_date
  sala: string;         // nombre de la sala ("Soles")
  parentsCount: number; // siempre 0 (no existe parent_children)
  allergy?: AllergyTag; // primera tag reconocida
  birthDate?: string;   // "12 mar 2022" formateada
  entry?: string;       // "feb 2025" formateada
  allergyNotes?: string;
  medicalNotes?: string;
  parents?: Parent[];   // [] (mock)
}
```

`components/kids/mapKid.ts` (nuevo):

```ts
export interface RoomOption { id: string; name: string }
export function mapChild(row: ChildrenRow, rooms: RoomOption[]): Kid;
export function textToTags(raw: string): string[];            // "Maní" → ["peanut"]
export function tagsToAllergy(tags: string[]): AllergyTag | undefined; // "peanut" → "maní"
export function formatSpanishDate(iso: string): string;        // "2022-03-12" → "12 mar 2022"
```

## Implementation plan

Estructura de archivos (nuevos en negrita, modificados marcados):

```
supabase/migrations/
  05-create_children.sql          # (nuevo)
types/
  supabase.ts                     # (regenerado)
components/kids/
  mockKids.ts                     # (mod) fuera KIDS/SALAS/Sala/buildKidId; Kid gana roomId
  mapKid.ts                       # (nuevo)
  RoomTabs.tsx                    # (nuevo)
  AddKidModal.tsx                 # (mod) rooms + Server Action
app/kids/
  page.tsx                        # (mod) fetch real + searchParams.room
  KidsPageClient.tsx              # (mod) chips, buscador por sala, estado vacío
  actions.ts                      # (nuevo) addKid
  [id]/page.tsx                   # (mod) fetch children por uuid
app/page.tsx                      # (mod) fetch children activos, pasa al feed
app/feed/
  FeedPageClient.tsx              # (mod) reenvía kids/rooms al modal
components/feed/
  NewPostModal.tsx                # (mod) PARA con niños reales + estado vacío
```

1. Crear `supabase/migrations/05-create_children.sql` con el SQL del Data model. *Funcional: archivo commiteado.*
2. Aplicar con `apply_migration` nombre `05_create_children`. Verificar vía MCP: tabla con RLS on, 4 policies, `children_room_id_idx`, 0 filas y drift check (archivo == `statements[0]` salvo newline final).
3. Regenerar `types/supabase.ts` con `supabase_generate_typescript_types`. *Funcional.*
4. Limpiar `mockKids.ts`: quitar `KIDS`, `SALAS`, `Sala`, `buildKidId`; `Kid` gana `roomId: string`. *Funcional: imports que solo usan tipos (`KidCard`, `ProfileClient`, `FeedContext`) siguen compilando.*
5. `components/kids/mapKid.ts`: `mapChild`, `textToTags`, `tagsToAllergy`, `formatSpanishDate` y avatar por hash del uuid. *Funcional (sin usos aún).*
6. `components/kids/RoomTabs.tsx`: chips + ribbon, estado activo terracota. *Funcional (sin usos aún).*
7. `app/kids/page.tsx`: `getCurrentUser("/kids")`, fetch `rooms` (order `name`) y `children` (`status='active'`, order `created_at desc`) con el cliente de `utils/supabase/server`; pasar todo como props a `KidsPageClient` junto a `searchParams.room`. *Funcional: la página renderiza con datos reales (lista vacía al principio).*
8. `KidsPageClient`: `RoomTabs` con conteos agrupados, selección sincronizada con `?room=` vía `router.replace`, buscador dentro de la sala, grilla de `KidCard`, estado vacío. *Funcional: `/kids` navegable sin mocks.*
9. `app/kids/actions.ts`: `addKid(prevState, formData)` con cliente `server.ts`; valida `room_id`, `full_name`, `birth_date` ISO, `enrolled_at` = hoy, `allergy_tags` vía `textToTags`, `medical_notes`; `revalidatePath('/kids')`; devuelve `{ error }` en español si falla el insert. *Funcional.*
10. `AddKidModal`: props `rooms: RoomOption[]` + `defaultRoomId`; guardar con `useActionState(addKid)`; "Guardar" muestra pending y el modal solo se cierra/resetea en éxito (efecto sobre el estado de la acción). *Funcional: alta real.*
11. `app/kids/[id]/page.tsx`: validar formato UUID (regex) antes de consultar; fetch `children` por id + `rooms` para el nombre de sala; si no existe o es inválido → `NotFound` existente; "Volver a Niños" → `/kids?room=<kid.roomId>`. *Funcional: perfil real.*
12. Feed: `app/page.tsx` hace fetch de `children` activos + `rooms` y los reenvía por props (`FeedPageClient` → `NewPostModal`); chips PARA con niños reales; mensaje vacío si no hay niños. *Funcional: feed sin mocks.*
13. `npm run lint` y `npm run build` en verde. Verificación manual Playwright completa (login staff, alta de 2 niños —uno con "maní"—, cambio de sala + reload, buscador, perfil, PARA del feed, logout).
14. Commit + PR en la rama `spec-11-kids-from-supabase`.

## Acceptance criteria

- [ ] Existe `supabase/migrations/05-create_children.sql` commiteado.
- [ ] `apply_migration` con `05_create_children` devuelve success; vía MCP: tabla `children` con RLS activado, 4 policies para `authenticated`, índice `children_room_id_idx` y 0 filas; sin drift con el archivo.
- [ ] `types/supabase.ts` incluye la tabla `children`.
- [ ] `rg "KIDS|SALAS"` en `app/` y `components/` devuelve 0 coincidencias.
- [ ] `/kids` muestra 4 chips (Soles, Lunas, Estrellas, Mariposas) provenientes de `rooms`, cada una con su ribbon con `0`.
- [ ] Al hacer clic en un chip la URL queda `?room=<uuid>`; al recargar se mantiene la sala seleccionada y su ribbon; sin parámetro arranca la primera sala por nombre.
- [ ] El select SALA del modal muestra exactamente los nombres de las 4 salas de la BD, con la sala activa en `/kids` preseleccionada por defecto.
- [ ] Guardar "Martina López / 15/03/2022 / maní" crea una fila en `children` (verificado con MCP: `birth_date = 2022-03-15`, `allergy_tags = {peanut}`, `room_id` de la sala de la pestaña) y cierra el modal.
- [ ] Tras guardar, la tarjeta aparece primera en la grilla de su sala, el ribbon de esa sala sube a 1, y la tarjeta muestra badge MANÍ si tiene alergia o VINCULAR si no.
- [ ] El buscador filtra solo los niños de la sala seleccionada; las demás salas conservan su ribbon intacto.
- [ ] Sala sin niños en `/kids` muestra "Aún no hay niños en esta sala" sin errores.
- [ ] Clic en una tarjeta navega a `/kids/<uuid>` y el perfil renderiza datos reales: nombre, "N años · Sala X", fecha de nacimiento "dd mmm aaaa", ingreso "mmm aaaa", caja de alergias MANÍ si aplica y notas médicas si existen.
- [ ] "Volver a Niños" regresa a `/kids` con `?room=` de la sala del niño activo.
- [ ] `/kids/<uuid-inexistente>` y `/kids/no-es-uuid` muestran el `NotFound` vacío, sin errores de consola ni 500.
- [ ] PARA del feed muestra chips con los niños reales (tras darlos de alta); "Toda la sala" sigue funcionando; con 0 niños muestra mensaje vacío.
- [ ] "Vincular" del perfil abre `LinkParentModal` (SPEC 05) y añade el padre en memoria.
- [ ] Consola sin errores durante el flujo completo login → `/kids` → alta → perfil → feed → logout.
- [ ] Sin regresiones en `/`, `/login`, `/activate` ni en los guards de SPEC 10.
- [ ] `npm run lint` y `npm run build` pasan sin errores.

## Decisions

- **Sí:** tabla `children` según el esquema objetivo (`../07-DB-Schema`), enum `child_status`, `allergy_tags` en inglés. Coherente con SPEC 06 (UI traduce).
- **Sí:** sin seed de niños — arrancamos de cero con la BD vacía (decisión del usuario). `mateo-fernandez` y los 8 mocks desaparecen.
- **Sí:** alta vía Server Action con cliente `server.ts` + `revalidatePath('/kids')`. Coherente con SPEC 10; ningún insert desde el navegador.
- **Sí:** fetch en Server Components con props hacia los Client Components (también en el feed). Ningún componente crea su propio `createBrowserClient`.
- **Sí:** UUID en la URL en lugar de slug. Id-canónico, sin colisiones de nombres. **No:** columna `slug` (colisiona con niños homónimos) ni mantener ambos.
- **Sí:** chips arriba con ribbon numérico en lugar de `<select>` de salas (propuesta del usuario, confirmada). **No:** `<select>` (oculta los contajes y añade clics) y secciones/accordion por sala (grilla más pesada y el buscador pierde sentido).
- **Sí:** `?room=<uuid>` en la URL: deep-link y reload conservan contexto. **No:** state en memoria (se pierde al recargar) ni `localStorage` (opaque a la navegación).
- **Sí:** avatar determinista por hash del uuid sobre `AVATAR_PALETTE`. Con `addedCount` (state de sesión) fuera, la rotación existente desaparece; el hash mantiene color estable por niño y variedad en la grilla.
- **Sí:** fecha de nacimiento unificada "12 mar 2022" (ISO en BD, formateada en UI). Cierra el riesgo de formato mixto documentado en SPEC 04.
- **Sí:** PARA del feed pasa a niños reales en este spec (confirmado por el usuario). **No:** mantener `KIDS` provisional solo para el feed (dos fuentes de verdad).
- **Sí:** texto de alergia no reconocido se descarta; solo `peanut`/`lactosa` generan tag (acordado).
- **No:** `updated_at` + trigger en `children`. No hay UI de actualización en este spec; se añadirá con `editar-nino`.
- **No:** `parent_children`, Vincular real, `photo_consent` en UI, RLS multi-tenant, `post_children`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Enlaces viejos a `/kids/mateo-fernandez` quedan muertos al pasar a UUID | UUID es el id canónico desde este spec; el `NotFound` existente lo gestiona con elegancia. |
| UUID malformado en `/kids/[id]` provoca error Postgres `22P02` (500) | Validar formato UUID con regex antes de lanzar la query; inválido → `NotFound`. |
| Feed sin niños deja PARA vacío hasta la primera alta | Estado vacío explícito y criterio de aceptación dedicado; se resuelve con el propio flujo de alta. |
| Contajes del ribbon requieren todos los niños en un fetch | Escala pequeña (4 salas, guardería única); si crece, `count()` agrupado por sala vía RPC. |
| Insert falla (red/RLS) con el modal abierto | La Server Action devuelve `{ error }` en español; el modal no se cierra ni resetea los campos. |
| `AddKidModal`/`NewPostModal` cambian sus props y podrían romper llamadas existentes | Un solo call site cada uno (`KidsPageClient`, `FeedPageClient`); criterios de regresión explícitos para feed y SPEC 05. |

## What is **not** in this spec

- `parent_children`, `invitations` ni "Vincular padre" persistente.
- Edición, archivo o baja de niños.
- UI de `photo_consent`, subida de fotos/avatares (Storage).
- Endurecimiento RLS multi-tenant ni Edge Functions.
- Publicaciones del feed con niños en BD (`post_children`).
- Activación real de `/activate`.

Cada una de esas, si llega, va en su propio spec.
