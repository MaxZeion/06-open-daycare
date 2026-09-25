# SPEC 01 — Feed como página home

> **Status:** Aprovado
> **Depends on:** — (es el primer spec)
> **Date:** 2026-09-24
> **Objective:** Implementar la maqueta `pantallas/feed.dc.html` como la página home `/`, fiel a su estilo, sin autenticación ni base de datos (datos mock estáticos).

## Why this spec exists

`AGENTS.md` decía que el diseño vive en las maquetas y no en el repo. Este spec rompe ese patrón: es el primer momento en que portamos el diseño de una maqueta al código. Aquí se establecen las convenciones (tokens de color/fuente, shell compartido, carpeta `components/` con subcarpetas por propósito) que heredarán los specs futuros.

## Scope

**In:**

- La home `/` replicando la maqueta: sidebar, header, caja de composición, divisor "PUBLICADO HOY" y 3 post cards (LOGRO, ACTIVIDAD con foto, ANUNCIO).
- Shell de app responsive: sidebar fija en desktop, top bar + drawer + botón flotante en mobile.
- Tokens de diseño (paleta crema/terracota + fuentes Fredoka y Nunito) en el layout global.
- Datos mock tipados para los 3 posts.

**Out of scope (para specs futuros):**

- Autenticación / login / logout.
- Base de datos ni API real.
- Las demás pantallas (Niños, Avisos, Mi cuenta, Crear publicación, Detalle).
- Carga real de fotos y estado real de likes/comentarios.

## Data model

```ts
// components/feed/mockPosts.ts
type PostKind = "logro" | "actividad" | "anuncio";

interface Post {
  id: string;
  author: { name: string; initials: string; bg: string; fg: string };
  time: string;          // "14:20"
  publishedBy: string;   // "publicado por vos"
  kind: PostKind;
  recipient: string;     // "familia de Mateo" | "toda la sala"
  body: string;
  photo?: string;        // label del placeholder, p.ej. "Foto · pintando con témperas"
  likes: number;
  comments: number;
}

export const POSTS: Post[] = [/* logro, actividad+foto, anuncio */];
```

Convenciones:

- Los colores de avatar y de badge viven como tokens (no hardcodeados en el componente).
- `kind` mapea al badge y al color (LOGRO verde, ACTIVIDAD azul, ANUNCIO índigo).

## Design tokens (`app/globals.css`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg` | `#F6ECDF` | fondo de página |
| `--surface` | `#FFFDF9` | cards, sidebar |
| `--border` | `#ECE0D0` | bordes |
| `--brand` | `#F2937A` (grad. `#F8C3A8→#F2937A`) | botones/acentos terracota |
| `--ink` | `#3F362E` | texto principal |
| `--ink-soft` | `#4A4038` | cuerpo de posts |
| `--muted` | `#A89A8B` / `#94887B` | texto secundario |
| `--badge-logro` | `#CFEBD8` / `#3E9B6C` | badge LOGRO |
| `--badge-actividad` | `#C7E7F1` / `#2E89A6` | badge ACTIVIDAD |
| `--badge-anuncio` | `#CCD8F4` / `#4E72C8` | badge ANUNCIO |

Fuentes: `Fredoka` (marca/títulos) + `Nunito` (cuerpo) vía `next/font`, definidas en el layout.

## Implementation plan

Estructura de archivos:

```
components/
  shared/
    AppShell.tsx   # frame responsive (client, state del drawer)
    Sidebar.tsx    # contenido de la barra lateral
    icons.tsx      # set de iconos SVG
  feed/
    PostCard.tsx   # renderiza un Post
    mockPosts.ts   # tipo Post + 3 mocks
```

1. `app/layout.tsx`: reemplazo Geist por Fredoka + Nunito (`next/font`), `lang="es"`, metadata (título OpenDayCare), bg base. *Funcional: compila, fuentes cargan.*
2. `app/globals.css`: defino los tokens de la tabla como variables/Tailwind theme + estilos base. *Funcional.*
3. `components/shared/icons.tsx`: set de iconos SVG usados (sol/logo, plus, home, users, bell, user, cámara, corazón, mensaje, megáfono, logout). *Funcional.*
4. `components/shared/Sidebar.tsx`: logo, botón "Nueva publicación", nav con Feed activo, footer de usuario. *Funcional.*
5. `components/shared/AppShell.tsx` (client): frame responsive — desktop flex con sidebar fija 248px + main scroll; mobile (< 768px) top bar con logo + hamburguesa que abre drawer con la sidebar, y "Nueva publicación" como botón flotante. *Funcional: shell renderiza, drawer abre/cierra.*
6. `components/feed/mockPosts.ts` (tipo + 3 mocks) y `components/feed/PostCard.tsx` (renderiza un `Post`). *Funcional.*
7. `app/page.tsx`: renderiza `<AppShell>` con header + caja de composición + divisor "PUBLICADO HOY" + `POSTS.map(PostCard)`. *Funcional: feed completo.*

## Acceptance criteria

- [x] `npm run lint` y `npm run build` pasan sin errores. — ok: `npm run lint` exit 0 (tras añadir `pantallas/**` a `globalIgnores` en `eslint.config.mjs`: el fallo venía de la maqueta `pantallas/support.js`, no del código de la app) y `npm run build` exit 0 (`/` prerenderizado como estático).
- [x] `npm run dev` → `/` renderiza sin errores en consola. — ok: consola con 0 errores durante la sesión (solo info de React DevTools + HMR); `.mcp-playwright/spec-01-desktop-top.png`.
- [x] Desktop (≥ 768px): layout igual a `pantallas/feed.dc.html` — sidebar crema fija de 248px (logo, "Nueva publicación", nav con Feed activo, footer "Caro Giménez · Maestra · Soles") + main centrado (max 760px) con header, caja de composición, divisor y exactamente 3 cards. — ok: DOM `w-[248px]` sticky, main 760px centrado (`contentLeft` 379 = centrado restando el scrollbar), 3 `article`; comparado 1:1 con la maqueta servida en :8099 (`.mcp-playwright/spec-01-mockup-feed.png` vs `spec-01-desktop-top.png`).
- [x] Fuentes visibles: Fredoka en marca/títulos, Nunito en cuerpo. — ok: computed styles `h1 → Fredoka`, `main p → Nunito` (viales `next/font/google` en `app/layout.tsx`).
- [x] Las 3 cards muestran el badge correcto (LOGRO verde, ACTIVIDAD azul con placeholder de foto, ANUNCIO índigo) y el texto/hora/destinatario/likes/comentarios de la maqueta. — ok: badges `#CFEBD8`/`#C7E7F1`(+foto)/`#CCD8F4`; tiempos 14:20/09:40/07:50, destinatarios y 3·1 / 5·2 / 8·0 de la maqueta (`.mcp-playwright/spec-01-desktop-cards.png`).
- [x] Colores coinciden con la paleta (bg `#F6ECDF`, surface `#FFFDF9`, bordes `#ECE0D0`, acentos terracota). — ok: computed `body bg rgb(246,236,223)`, card `rgb(255,253,249)`, borde `rgb(236,224,208)`; tokens en `app/globals.css`.
- [x] Mobile (< 768px): sidebar oculta; top bar con logo + hamburguesa que abre el drawer; "Nueva publicación" como botón flotante. — ok: a 390×844 sidebar `display:none`, top bar visible, drawer abre/cierra con overlay, FAB `fixed` bottom-right (`.mcp-playwright/spec-01-mobile-top.png`, `spec-01-mobile-drawer.png`).
- [x] Nav y botones no navegan (sin 404); ningún clic rompe la página. — ok: clics en Niños, FAB, Editar, composer y logout dejan la URL en `/` (sin navegación ni 404); consola sin errores.

## Decisions

- **Sí:** Tailwind v4 + tokens (arbitrarios para px exactos 11.5/14.5/16.5). Idiomático con el repo y fiel.
- **No:** `.css` dedicado 1:1 ni estilos inline. Sale de la convención Tailwind / poco mantenible.
- **Sí:** carpeta `components/` con `shared/` (reutilizables) y `feed/` (por feature). La subcarpeta indica el propósito y escala a futuras pantallas.
- **No:** todo plano en `components/` sin subcarpetas. Se acumula al llegar más pantallas.
- **Sí:** `AppShell.tsx` + `Sidebar.tsx` compartidos en `shared/`. La sidebar es idéntica en todas las maquetas; evita duplicar.
- **No:** todo inline en `page.tsx`. Duplicaría el shell por pantalla.
- **Sí:** `shared/icons.tsx` como set central de SVG.
- **Sí:** nav/botones son no-ops visuales (sin rutas reales). Sin auth y sin otras pantallas; evita 404 y mantiene fidelidad.
- **No:** rutas stub `/ninos` etc. Sale del scope "solo el feed".
- **Sí:** fuentes en layout global + `lang="es"`. Todas las pantallas las heredan.
- **Sí:** mocks tipados (usuario pidió "usar mocks"). Listo para swap a una fuente real.
- **No:** hardcodear los 3 posts en el JSX. Repetitivo.
- **Sí:** responsive, mobile = top bar + drawer + FAB. Breakpoint 768px.

## Risks

| Risk | Mitigation |
| --- | --- |
| La maqueta no tiene diseño mobile, pero el usuario pidió responsive | Defino la IA mobile (top bar + drawer + FAB) como única fuente de verdad; desktop se mantiene 1:1 con la maqueta. Mobile es una extensión sensata, no un claim de fidelidad. |
| Px exactos (11.5/14.5/16.5) no entran en la escala Tailwind | Uso valores arbitrarios; los tokens centralizan lo repetido. |
| Fredoka/Nunito son Google Fonts | `next/font` los auto-aloja en build (sin red en runtime); verificar que el build los empaqueta. |

## What is **not** in this spec

- Autenticación / login.
- Base de datos ni API.
- Las demás pantallas.
- Fotos reales ni estado real de likes/comentarios.

Cada una de esas, si llega, va en su propio spec.
