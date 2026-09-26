# SPEC 07 — Modal "Nueva publicación"

> **Status:** Aprovado
> **Depends on:** SPEC 01 (feed, tipo `Post`, badge por `kind`), SPEC 02 (`KIDS` con avatar/initials), SPEC 04 (patrón de modal: portal + validación inline + "Publicar siempre habilitado"), SPEC 06 (copy en español de España)
> **Date:** 2026-09-26
> **Objective:** Implementar el modal del botón "Nueva publicación" fiel a `pantallas/crear-publicacion.dc.html`, con selección múltiple de niños en la fila PARA (toggle; "Toda la sala" selecciona a todos y oculta los chips individuales), tipo único, descripción obligatoria, y publicación como un solo post multi-destino en el feed en memoria.

## Why this spec exists

El botón "Nueva publicación" (sidebar desktop + FAB mobile) y la caja "Comparte un momento…" del feed son no-ops desde SPEC 01. Es el primer spec cuyo disparador vive en `AppShell`/`Sidebar` pero cuyo resultado se consume en otra página (el feed): por eso introduce un `FeedContext` (provider montado en el layout) en lugar de estado local de página. Además amplía `PostKind` de 3 a 7 valores y el tipo de destino sigue siendo `recipient: string` compuesto, sin tocar el render de `PostCard` más allá del mapa de badges.

## Scope

**In:**

- Componente `NewPostModal` (client, portal) que replica la maqueta `crear-publicacion.dc.html`:
  - Header: "Cancelar" (`--muted-strong`, cierra) / título "Nueva publicación" (Fredoka 18px/600) / "Publicar" (`--accent` 15px/800, siempre habilitado).
  - Sección **PARA**: chips pill con los 8 niños de `KIDS` (avatar con iniciales y color de `--avatar-*`) + chip "Toda la sala". Toggle en fila única: niño seleccionado → chip oscuro (bg/borde `--ink`, texto blanco); no seleccionado → chip claro (bg `#FFFDF9`, borde `#ECE0D0`, texto `#6E6359`). "Toda la sala" activo → selecciona a los 8, **oculta los chips individuales** dejando solo el chip "Toda la sala" en estado oscuro; desactivarlo limpia la selección y restaura los 8 chips.
  - Sección **TIPO**: 7 pills de selección única con los colores exactos de la maqueta (Comida `#9A7B1E`/blanco, Siesta `#E7DCF6`/`#7B5FC0`, Actividad `#2E89A6`/blanco, Logro `#CFEBD8`/`#3E9B6C`, Ánimo `#F9D2DE`/`#C56486`, Foto `#FBD8CC`/`#D9684A`, Anuncio `#CCD8F4`/`#4E72C8`); la seleccionada añade borde `1.5px solid var(--ink)`. Default al abrir: **Actividad**.
  - Sección **DESCRIPCIÓN**: textarea (min-height 120px, placeholder **"Cuenta cómo le fue hoy…"** — adaptado a tuteo por SPEC 06, la maqueta dice "Contá").
  - Sección **FOTOS** (decorativa): tile placeholder de 96px con icono de imagen + tile "Agregar" (borde discontinuo, icono `+` terracota). Sin comportamiento: no abre file picker ni adjunta nada.
- Apertura del modal desde **los tres disparadores**: botón "Nueva publicación" del `Sidebar` (desktop), FAB "Nueva publicación" del `AppShell` (mobile) y caja "Comparte un momento…" del feed.
- Cierre por "Cancelar", Escape o click en el overlay; `body { overflow: hidden }` mientras está abierto; `role="dialog"`, `aria-modal="true"`, focus inicial.
- Validación al pulsar "Publicar" (siempre habilitado, estilo `AddKidModal`):
  - Sin niños seleccionados (y sin "Toda la sala") → error inline: "Selecciona al menos un niño o pulsa Toda la sala."
  - Descripción vacía o solo espacios → error inline: "Escribe una descripción."
  - Mensajes rojos bajo la sección correspondiente (borde `--field-error` en el textarea), mismo patrón que SPEC 04/05.
- Publicar válido: construye **un solo `Post`** y lo añade al inicio del feed (state en memoria persistente entre navegaciones de la sesión):
  - `recipient`: `"toda la sala"` con Toda-la-sala activo; si no, con nombres de pila: 1 → `"familia de Mateo"`; 2 → `"familia de Mateo y Sofía"`; ≥3 → `"familia de Mateo, Sofía y Benjamín"`; >3 → `"… y N más"`.
  - `author`: primer niño seleccionado (iniciales y colores de su `avatar` en `KIDS`); con "toda la sala" → avatar `--avatar-anuncio-*` con nombre "Anuncio general" (igual que el post de anuncio actual).
  - `kind`: tipo elegido; `body`: descripción; `time`: hora actual del cliente `HH:MM`; `publishedBy: "publicado por ti"`; `likes: 0`, `comments: 0`; `photo`: sin foto (FOTOS es decorativa).
- Ampliación de `PostKind` a `"comida" | "siesta" | "actividad" | "logro" | "animo" | "foto" | "anuncio"` con badges nuevos en `PostCard` (comida, siesta, animo, foto) usando los tokens de la tabla.
- `FeedContext`: provider client montado en `app/layout.tsx` que holds `posts` (inicializado con `POSTS`), `modalOpen`, `publish(post)`, `openModal()`, `closeModal()`, y monta `<NewPostModal>` una sola vez.
- Tokens nuevos (tabla) en `app/globals.css`.

**Out of scope (para specs futuros):**

- Backend / API / persistencia entre recargas (el post publicado desaparece al refrescar, coherente con SPEC 04/05).
- Subida real de fotos (`<input type="file">`, object URLs, previsualizaciones).
- Edición/borrado de publicaciones, likes y comentarios reales, sección de comentarios.
- Adjuntar la descripción de la maqueta como valor inicial (el textarea arranca vacío).
- `Resumen del día`, `Editar`, otras pantallas (`familia-feed`, detalle de post).

## Data model

```ts
// components/feed/mockPosts.ts (mod, aditivo)
export type PostKind =
  | "comida" | "siesta" | "actividad" | "logro"
  | "animo" | "foto" | "anuncio"; // antes solo "logro" | "actividad" | "anuncio"

// El interface Post NO cambia: recipient sigue siendo string compuesto.

// components/feed/mockPosts.ts (nuevo export)
export const KIND_META: Record<PostKind, { label: string; bg: string; fg: string }> = {
  comida:   { label: "COMIDA",    bg: "var(--badge-comida-bg)",    fg: "var(--badge-comida-fg)" },
  siesta:   { label: "SIESTA",    bg: "var(--badge-siesta-bg)",    fg: "var(--badge-siesta-fg)" },
  actividad:{ label: "ACTIVIDAD", bg: "var(--badge-actividad-bg)", fg: "var(--badge-actividad-fg)" },
  logro:    { label: "LOGRO",     bg: "var(--badge-logro-bg)",     fg: "var(--badge-logro-fg)" },
  animo:    { label: "ÁNIMO",     bg: "var(--badge-animo-bg)",     fg: "var(--badge-animo-fg)" },
  foto:     { label: "FOTO",      bg: "var(--badge-foto-bg)",      fg: "var(--badge-foto-fg)" },
  anuncio:  { label: "ANUNCIO",   bg: "var(--badge-anuncio-bg)",   fg: "var(--badge-anuncio-fg)" },
};

// components/feed/FeedContext.tsx (nuevo)
interface FeedContextValue {
  posts: Post[];
  modalOpen: boolean;
  openModal(): void;
  closeModal(): void;
  publish(input: { kind: PostKind; body: string; kids: Kid[]; allRoom: boolean }): void;
}

// Helper puro en el mismo archivo (testeable):
export function buildRecipient(kids: Kid[], allRoom: boolean): string;
```

Convenciones:

- `buildRecipient`: nombres de pila = `kid.name.split(" ")[0]`; reglas exactas del Scope.
- `publish` deriva `id` (`post-${Date.now()}`), `time` (`new Date()` → `HH:MM` padded), `author` (primer `kid` de la selección: `{ name: firstName, initials: kid.initials, bg: kid.avatar.bg, fg: kid.avatar.fg }`; con `allRoom` → `{ name: "Anuncio general", initials: "", bg: "var(--avatar-anuncio-bg)", fg: "var(--avatar-anuncio-fg)" }`).
- "Toda la sala" se modela como flag booleano del modal, no como selección de los 8 ids.

## Design tokens (nuevos en `app/globals.css`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--badge-comida-bg` / `--badge-comida-fg` | `#9A7B1E` / `#FFFFFF` | pill/badge Comida |
| `--badge-siesta-bg` / `--badge-siesta-fg` | `#E7DCF6` / `#7B5FC0` | pill/badge Siesta |
| `--badge-animo-bg` / `--badge-animo-fg` | `#F9D2DE` / `#C56486` | pill/badge Ánimo |
| `--badge-foto-bg` / `--badge-foto-fg` | `#FBD8CC` / `#D9684A` | pill/badge Foto |
| `--pill-actividad-solid-bg` / `-fg` | `#2E89A6` / `#FFFFFF` | pill Actividad en el modal (el badge del feed sigue con `--badge-actividad-*` claro) |
| `--chip-off-bg` / `--chip-off-fg` / `--chip-off-border` | `#FFFDF9` / `#6E6359` / `#ECE0D0` | chip PARA no seleccionado |
| `--chip-on-bg` / `--chip-on-fg` / `--chip-on-border` | `#3F362E` / `#FFFFFF` / `#3F362E` | chip PARA seleccionado y "Toda la sala" activo |
| `--photo-tile-bg` / `--photo-tile-border` | `#F4ECE1` / `#ECE0D0` | tile placeholder FOTOS |
| `--photo-tile-add-border` / `--photo-tile-add-fg` | `#DBCDBA` / `#B0A290` | tile "Agregar" (borde dashed) |

Reutilizados: `--modal-bg`, `--shadow-modal`, `--border`, `--field-error`, `--field-bg`, `--input-border`, `--ink`, `--muted-strong`, `--accent`, `--avatar-*`. Alias `@theme inline` para los nuevos tokens, mismo patrón que SPEC 04/05.

## Implementation plan

Estructura (nuevos en **negrita**, modificados en *ital*):

```
components/
  feed/
    mockPosts.ts        # (mod) PostKind 7 valores + KIND_META
    PostCard.tsx        # (mod) badge desde KIND_META
    FeedContext.tsx     # (nuevo) provider + buildRecipient + monta NewPostModal
    NewPostModal.tsx    # (nuevo) modal client
  shared/
    AppShell.tsx        # (mod) FAB abre openModal()
    Sidebar.tsx         # (mod) botón "Nueva publicación" abre openModal()
    icons.tsx           # (mod) ImageFrameIcon, ImagePlusIcon (trazos de FOTOS)
app/
  globals.css           # (mod) tokens de la tabla
  layout.tsx            # (mod) envolver children en <FeedProvider>
  page.tsx              # (mod) "use client"; posts desde contexto; caja composer abre modal
```

1. `app/globals.css`: tokens nuevos + alias `@theme`. *Funcional: compila.*
2. `components/feed/mockPosts.ts`: `PostKind` a 7 valores + `KIND_META` (los 3 badges existentes conservan sus tokens actuales; los 3 posts mock no cambian). *Funcional: SPEC 01 intacto.*
3. `components/feed/PostCard.tsx`: badge usa `KIND_META[post.kind]` (label/bg/fg) en lugar del mapa local de 3 entradas. *Funcional: los 3 posts actuales se ven idénticos.*
4. `components/shared/icons.tsx`: `ImageFrameIcon` (rect+circle+path de la maqueta, `strokeWidth` 1.7) e `ImagePlusIcon` (`M12 5v14M5 12h14`, stroke `#C5503A`). *Funcional.*
5. `components/feed/FeedContext.tsx` (client): provider con `posts` (init `POSTS`), `modalOpen`, `openModal/closeModal`, `publish(input)` que construye el `Post` (reglas del Data model) y lo pone al inicio; `buildRecipient` exportado. Monta `<NewPostModal open onClose>` internamente. *Funcional: provider vacío sin consumidores aún.*
6. `components/feed/NewPostModal.tsx` (client): portal a `document.body`; overlay `fixed inset-0 z-50` con scroll lock + Escape + click-fuera (patrón `AddKidModal`); tarjeta `max-w-[580px]` con `--modal-bg`, borde `--border`, radius 24, `--shadow-modal`; header Cancelar/título/Publicar; fila PARA (chips `KIDS` + "Toda la sala", estados on/off por tokens, ocultación de chips individuales con allRoom); fila TIPO (7 pills con `KIND_META`-colors + `--pill-actividad-solid-*`, selección única default `actividad`, borde `--ink` en la activa); textarea DESCRIPCIÓN; sección FOTOS decorativa; estado local `selectedKids: string[]`, `allRoom`, `kind`, `body`, `attempted`; errores inline bajo PARA y DESCRIPCIÓN; "Publicar" → `attempted` si inválido, si válido `publish(...)` + cierre + reset. *Funcional: compila, se puede invocar desde el provider.*
7. `app/layout.tsx`: envolver children con `<FeedProvider>` dentro del body. *Funcional.*
8. `components/shared/AppShell.tsx` + `Sidebar.tsx`: `onClick={openModal}` en FAB y botón (consumen `useFeed()`). *Funcional: el modal abre desde cualquier página.*
9. `app/page.tsx`: pasa a `"use client"`; renderiza `posts` del contexto en lugar de `POSTS`; la caja "Comparte un momento…" abre el modal. *Funcional: flujo completo end-to-end.*
10. Responsive: tarjeta `w-full max-w-[580px]` con márgenes 16px en mobile, `max-h` + scroll interno si excede, sin overflow horizontal (verificado a 390×844). *Funcional.*

No se tocan `/kids`, `/kids/[id]`, `/login`, `/activate` (el provider solo añade contexto; sus páginas siguen igual).

## Acceptance criteria

- [ ] `npm run lint` y `npm run build` pasan sin errores.
- [ ] El modal abre desde los tres disparadores (sidebar desktop, FAB mobile, caja del feed) con el mismo contenido; URL no cambia.
- [ ] Modal desktop fiel a la maqueta: tarjeta `max-w-[580px]` centrada, bg `#FBF4EC`, borde `#ECE0D0`, radius 24, sombra; header "Cancelar" `#94887B`/700, título Fredoka 18px/600 "Nueva publicación", "Publicar" `#D9583C`/800; labels 12px/800 tracking `.7px` `#94887B` (PARA/TIPO/DESCRIPCIÓN/FOTOS); textarea placeholder "Cuenta cómo le fue hoy…" (`#B6A99B`), min-height 120px, bg blanco, borde `#EADFD0`, radius 14; FOTOS con tile 96px `#F4ECE1` + tile "Agregar" dashed con `+` `#C5503A` y texto 12px `#B0A290`.
- [ ] PARA lista los 8 niños de `KIDS` con su avatar (`--avatar-*`) e iniciales; chip no seleccionado: bg `#FFFDF9`, borde `#ECE0D0`, texto `#6E6359`; seleccionado: bg/borde `#3F362E`, texto blanco; el toggle añade/quita sin desaparecer de la fila.
- [ ] "Toda la sala": al activarse desaparecen los chips individuales y queda solo el chip "Toda la sala" en estado oscuro; al desactivarse vuelven los 8 chips sin selección; si había selección individual, al activar "Toda la sala" se anula la visibilidad de los chips (equivalente a todos).
- [ ] TIPO: 7 pills con colores exactos de la maqueta; selección única; default "Actividad"; la activa lleva borde `#3F362E`; cambiar de tipo no limpia el resto del formulario.
- [ ] "Publicar" sin niños: error "Selecciona al menos un niño o pulsa Toda la sala." bajo PARA, no cierra, no publica. Con descripción vacía/espacios: error "Escribe una descripción." bajo el textarea y borde rojo `#C5413A`; al corregir, el error desaparece en vivo.
- [ ] Publicar con 2 niños (Mateo + Sofía) y texto: crea **1 solo post** al inicio de "PUBLICADO HOY" con `recipient` "familia de Mateo y Sofía", badge del tipo elegido, avatar de Mateo, hora actual `HH:MM`, "publicado por ti", 0 likes/0 comentarios, sin foto; modal se cierra y los campos quedan limpios al reabrir.
- [ ] Publicar con "Toda la sala": `recipient` "toda la sala", avatar "Anuncio general" (`--avatar-anuncio-*`), badge correcto. Con 5 niños: `recipient` "familia de X, Y, Z y 2 más".
- [ ] Cancelar, Escape y click-fuera cierran sin publicar; con modal abierto `document.body.style.overflow === "hidden"` y al cerrar vuelve a `""`; `role="dialog"` + `aria-modal="true"`.
- [ ] FOTOS: click en "Agregar" no abre diálogo de archivos ni añade tiles (decorativo).
- [ ] Badges nuevos en `PostCard`: comida/siesta/animo/foto usan sus tokens (`--badge-comida-bg` `#9A7B1E`, etc.) con label en mayúsculas ("ÁNIMO" con tilde); los 3 posts mock actuales se renderizan idénticos que antes (badge-actividad sigue claro `#C7E7F1`).
- [ ] El post publicado persiste al navegar a `/kids` y volver a `/` sin recargar (mismo layout con provider); al recargar la página desaparece (solo `POSTS` mock).
- [ ] Mobile 390×844: tarjeta ancho completo con márgenes 16px, `overflow-x` 0 en la página, scroll interno si excede altura, FAB abre y cierra el modal.
- [ ] Regresión: `/`, `/kids`, `/kids/mateo-fernandez`, `/login`, `/activate` renderizan con 0 errores de consola; `AddKidModal` y `LinkParentModal` siguen funcionando.

## Decisions

- **Sí:** fila única con toggle para PARA (el usuario descartó la fila separada seleccionados/disponibles); "desaparecer de opciones" se materializa solo con "Toda la sala" (oculta los chips individuales). Decidido por el usuario.
- **Sí:** los tres disparadores abren el modal (sidebar, FAB, caja del feed). Decidido por el usuario.
- **Sí:** un solo post multi-destino con `recipient: string` compuesto, en lugar de 1 post por niño o `recipients: string[]`. Decidido por el usuario; mínimo cambio en SPEC 01.
- **Sí:** `PostKind` ampliado a los 7 tipos con tokens nuevos, en vez de mapear 7→3. Decidido por el usuario; conserva los colores de la maqueta.
- **Sí:** `FeedContext` provider en el layout. El disparador vive en `AppShell`/`Sidebar` y el consumo en `/`, árboles distintos: es el primer caso que lo requiere (SPEC 04/05 usaron state local). Alternativa descartada: duplicar el modal en cada página (dos instancias, estado de posts incoherente).
- **Sí:** FOTOS 100% decorativa (el usuario eligió la opción recomendada); subida real queda para otro spec.
- **Sí:** TIPO default "Actividad" y sin niños preseleccionados al abrir (la maqueta con Mateo oscuro es solo ejemplo). Decidido por el usuario.
- **Sí:** "Publicar" siempre habilitado con errores inline tras el intento — patrón fijado en SPEC 04.
- **Sí:** hora del post = `new Date()` del cliente en `HH:MM`; `likes`/`comments` 0. La hora se calcula solo en el evento `publish`, nunca en render (evita mismatch de hidratación).
- **Sí:** overlay como `AddKidModal` (capa que captura click-fuera con la tarjeta centrada sobre el fondo de la maqueta).
- **No:** persistencia (localStorage/API) — coherente con todo el proyecto mock.
- **No:** `recipients: string[]` en `Post` — cambiaría el modelo de SPEC 01 y `PostCard`; el string compuesto basta.
- **Sí:** placeholder adaptado a tuteo: "Cuenta cómo le fue hoy…" (la maqueta dice "Contá"; SPEC 06 manda).

## Risks

| Risk | Mitigación |
| --- | --- |
| `app/page.tsx` pasa de server a client component | El feed no tiene lógica server (solo renderiza mocks); el provider ya obliga a un cliente bajo el layout. Criterio de regresión explícito para `/`. |
| Provider en `layout.tsx` convierte el árbol en client-tree boundary | `FeedProvider` es un envoltorio mínimo; las páginas kids/login/activate siguen siendo server components que solo renderizan `AppShell` (ya client). Verificado por el criterio de regresión. |
| `PostCard` cambia su mapa de badges (3→7) y podría alterar los posts existentes | `KIND_META` reutiliza los tokens `--badge-*` actuales para logro/actividad/anuncio; criterio explícito de render idéntico. |
| Chips con `flex-wrap` y 8 niños + "Toda la sala" pueden desbordar en mobile | `flex-wrap gap-[9px]` + tarjeta con scroll interno; criterio de overflow-x 0 a 390px. |
| `new Date()` causa mismatch de hidratación | La hora se calcula solo en el evento `publish` (post-hidratación), nunca en render. |

## What is **not** in this spec

- Backend / API / persistencia entre recargas.
- Subida real de fotos ni previsualización de imágenes.
- Edición/borrado de posts, likes/comentarios interactivos, detalle de post.
- Otras pantallas de `pantallas/` (familia-feed, editar-nino, resumen-dia, etc.).

Cada una de esas, si llega, va en su propio spec.
