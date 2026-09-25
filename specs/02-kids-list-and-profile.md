# SPEC 02 — Niños: listado y perfil

> **Status:** Aprobado
> **Depends on:** SPEC 01 (feed home)
> **Date:** 2026-09-25
> **Objective:** Implementar las maquetas `pantallas/ninos.dc.html` y `pantallas/perfil-nino.dc.html` como las rutas `/kids` y `/kids/[id]`, fieles a su estilo, sin autenticación ni base de datos (datos mock estáticos).

## Why this spec exists

SPEC 01 portó el feed y estableció el shell compartido (`AppShell`/`Sidebar`/`icons`), los tokens y la convención `components/<feature>/` con mocks tipados. Este spec hereda todo eso y agrega las dos primeras pantallas de la sección **Niños**: el listado de la sala (buscador + badges de alergia/vinculación) y el perfil (datos, alergias, padres vinculados). Es el primer spec con **navegación real** dentro del área de gestión (el feed lo tenía todo como no-op).

## Scope

**In:**

- La ruta `/kids` replicando `ninos.dc.html`: header "GESTIÓN / Niños" + botón "Agregar niño", caja de búsqueda **funcional**, divisor "SALA SOLES · 8 niños" y la grilla 2 columnas de 8 tarjetas de niño (avatar + nombre + edad/padres + badge o chevron).
- La ruta `/kids/[id]` replicando `perfil-nino.dc.html`: "Volver a Niños", avatar grande + nombre + edad/sala + botón "Editar", caja de alergias, tarjeta de datos (fecha de nacimiento, sala, ingreso) y columna de "Padres vinculados" (rows + badges ACTIVA/PENDIENTE + "Vincular otro padre").
- Navegación real: tarjeta de niño → `/kids/[id]`; "Volver a Niños" → `/kids`; sidebar "Niños" activo en ambas rutas.
- Buscador funcional: filtra los 8 niños por nombre en vivo.
- Tokens de diseño nuevos (badges de alergia/vinculación, caja de alerta, estados de padre, paleta de avatares) en `app/globals.css`.
- Mock tipado de los 8 niños + detalle de perfil.

**Out of scope (para specs futuros):**

- Las pantallas `agregar-nino`, `vincular-padre`, `resumen-dia` y `editar` (sus botones son no-ops visuales, como en SPEC 01).
- Autenticación / login / logout.
- Base de datos, API real o rutas reales de esos botones.
- Estado real de padres (alta/baja), carga real de datos, validaciones.

## Data model

```ts
// components/kids/mockKids.ts
export type AllergyTag = "maní" | "lactosa";
export type ParentStatus = "activa" | "pendiente";

export interface Parent {
  name: string;
  initials: string;
  bg: string;   // token de avatar
  fg: string;
  role: string; // "Mamá" | "Papá"
  status: ParentStatus; // "activa" → ACTIVA, "pendiente" → PENDIENTE
  note?: string;  // "activa" | "invitación enviada"
}

export interface Kid {
  id: string;          // "mateo-fernandez"
  name: string;        // "Mateo Fernández"
  initials: string;    // "M"
  avatar: { bg: string; fg: string }; // tokens
  age: number;         // 3
  sala: string;        // "Soles"
  parentsCount: number; // 2
  allergy?: AllergyTag; // muestra badge; ausente → chevron
  // Detalle de perfil:
  birthDate?: string;  // "12 mar 2022"
  entry?: string;      // "feb 2025"
  allergyNotes?: string; // texto de la caja de alergias
  parents?: Parent[];
}

export const KIDS: Kid[] = [/* 8 niños, fiel a la maqueta */];
```

Convenciones:

- Colores de avatar, badge y estado de padre son **tokens** (referidos por `var(--…)`), nunca hex hardcodeado en el componente.
- Lógica del lado derecho de la tarjeta: `allergy` → badge naranja (MANÍ/LACTOSA); `parentsCount === 0` → badge rosa VINCULAR; en caso contrario → chevron.
- `Mateo Fernández` lleva detalle completo de perfil (el ejemplo de la maqueta); los 7 restantes llevan al menos edad/sala/padres para poder renderizar su perfil sin romperse.

## Design tokens (nuevos en `app/globals.css`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--allergy-badge-bg` / `--allergy-badge-fg` | `#FBD8CC` / `#D9684A` | badge MANÍ y LACTOSA |
| `--link-badge-bg` / `--link-badge-fg` | `#F9D2DE` / `#C56486` | badge VINCULAR |
| `--parent-active-bg` / `--parent-active-fg` | `#CFEBD8` / `#3E9B6C` | badge ACTIVA |
| `--parent-pending-bg` / `--parent-pending-fg` | `#F7E7A6` / `#9A7B1E` | badge PENDIENTE |
| `--alert-box-bg` / `--alert-icon` | `#FBDAD6` / `#F4A8A0` | fondo e icono de la caja de alergias |
| `--alert-title` / `--alert-text` | `#C5413A` / `#B25249` | texto de la caja de alergias |
| `--dark-cta` | `#3F362E` | botón "Resumen del día" |
| `--avatar-*` (sofia, benjamin, valentina, tomas, lucas, olivia) | ver maqueta | avatares de los 8 niños |

Los tokens ya existentes de SPEC 01 (`bg`, `surface`, `border`, `brand`, `ink`, `muted`, `accent`, `divider-ink`, etc.) se reutilizan tal cual. Fuentes Fredoka + Nunito ya están en el layout global.

## Implementation plan

Estructura de archivos (nuevos en negrita, modificados marcados):

```
components/
  shared/
    icons.tsx        # (mod) agregar Search, ChevronRight, AlertTriangle, ArrowLeft
    Sidebar.tsx      # (mod) aceptar active: "feed" | "kids" (default "feed")
    AppShell.tsx     # (mod) aceptar y pasar active a Sidebar
  kids/
    mockKids.ts      # (nuevo) tipo Kid/Parent + 8 mocks
    KidCard.tsx      # (nuevo) tarjeta de la grilla
    ParentRow.tsx    # (nuevo) row de padre + badge de estado
    AllergyBox.tsx   # (nuevo) caja de alergias del perfil
    InfoRow.tsx      # (nuevo) fila label/valor de la tarjeta de datos
app/
  globals.css        # (mod) tokens nuevos de la tabla
  kids/
    page.tsx         # (nuevo) listado /kids (client: estado del buscador)
    [id]/
      page.tsx       # (nuevo) perfil /kids/[id]
```

1. `app/globals.css`: agrego los tokens nuevos de la tabla. *Funcional: compila.*
2. `components/shared/icons.tsx`: agrego `SearchIcon`, `ChevronRightIcon`, `AlertTriangleIcon`, `ArrowLeftIcon` (mismos trazos de las maquetas, patrón `Svg`). *Funcional.*
3. `components/shared/Sidebar.tsx`: el item "Niños" pasa de button a `Link` hacia `/kids` y acepta `active` para resaltar "Niños" o "Feed". `AppShell.tsx` recibe `active` (default `"feed"`) y lo propaga. *Funcional: feed sigue con "Feed" activo.*
4. `components/kids/mockKids.ts`: tipo `Kid`/`Parent` + los 8 niños de la maqueta (Mateo con detalle completo). *Funcional.*
5. `components/kids/KidCard.tsx`: avatar 48px, nombre, edad/padres, y badge (alergia/vincular) o chevron según lógica. `Link` hacia `/kids/[id]`, con hover (borde terracota + lift). *Funcional.*
6. `app/kids/page.tsx` (client): `AppShell active="kids"` + header, buscador (state `query` filtra `KIDS` por nombre), divisor y grilla `grid grid-cols-2 gap-[14px]` mapeando `KidCard`. *Funcional: /kids renderiza.*
7. `components/kids/ParentRow.tsx`, `AllergyBox.tsx` y `InfoRow.tsx`. *Funcional.*
8. `app/kids/[id]/page.tsx`: `AppShell active="kids"` + "Volver a Niños" (Link `/kids`) + avatar/nombre/edad + "Editar" (no-op) + `AllergyBox` + tarjeta de datos (3 `InfoRow`) + "Resumen del día" (no-op) + lista de `ParentRow` + "Vincular otro padre" (no-op). Lee el niño por `params.id`; si no existe, estado vacío. *Funcional: perfil completo.*

## Acceptance criteria

- [x] `npm run lint` y `npm run build` pasan sin errores. — ok: `npm run lint` exit 0; `npm run build` exit 0 (Next 16.3.6, rutas `/` ○, `/_not-found` ○, `/kids` ○, `/kids/[id]` ƒ)
- [x] `npm run dev` → `/kids` renderiza sin errores en consola. — ok: `http://localhost:3000/kids` 200, 0 errores en consola (`.mcp-playwright/spec-02-colors-desktop.png`)
- [x] Desktop `/kids` igual a `ninos.dc.html`: header "GESTIÓN/Niños" + "Agregar niño", buscador, divisor "SALA SOLES · 8 niños" y grilla 2 columnas de 8 tarjetas con avatar/nombre/edad. — ok: `.mcp-playwright/spec-02-colors-desktop.png` vs maqueta `pantallas/ninos.dc.html`
- [x] Lado derecho de cada tarjeta correcto: MANÍ y LACTOSA → badge naranja, Valentina (sin padres) → badge rosa VINCULAR, el resto → chevron. — ok: lógica en `components/kids/KidCard.tsx`; screenshot confirma MANÍ/LACTOSA naranjas, Valentina VINCULAR rosa, resto chevron
- [x] Buscador filtra en vivo por nombre (escribir "Sof" deja solo Sofía; texto vacío muestra los 8). — ok: escribir "Sof" → solo Sofía; borrar → 8 tarjetas (verificado en vivo)
- [x] Clic en una tarjeta navega a `/kids/[id]` y la sidebar "Niños" queda activa en `/kids` y `/kids/[id]` (Feed deja de estar activo). — ok: clic tarjeta → `/kids/[id]`; Niños `#FBE3D8`/`#D9583C` activo y Feed inactivo en `/kids` y `/kids/[id]`
- [x] `/kids/[id]` de Mateo igual a `perfil-nino.dc.html`: "Volver a Niños", avatar 84px + "Mateo Fernández" + "3 años · Sala Soles", caja de alergias (MANÍ/inhalador), 3 filas de datos (12 mar 2022 / Soles / feb 2025), "Resumen del día", padre Lucía ACTIVA + Diego PENDIENTE + "Vincular otro padre". — ok: `.mcp-playwright/spec-02-profile-desktop.png` vs maqueta `pantallas/perfil-nino.dc.html` (0 errores)
- [x] "Volver a Niños" vuelve a `/kids`; "Agregar niño", "Editar", "Resumen del día" y "Vincular otro padre" son no-ops (no navegan, no dan 404, sin errores en consola). — ok: Volver → `/kids`; Editar/Resumen/Vincular no navegan (URL constante, sin 404, 0 errores)
- [x] Colores coinciden con la paleta (bg `#F6ECDF`, surface `#FFFDF9`, bordes `#ECE0D0`, acentos terracota) y fuentes Fredoka/Nunito visibles. — ok: computed styles bg `rgb(246,236,223)`, surface `rgb(255,253,249)`, borde `rgb(236,224,208)`, acento `#D9583C`; H1 Fredoka, body Nunito (`.mcp-playwright/spec-02-colors-desktop.png`)
- [x] Mobile (< 768px): usa el drawer del `AppShell` (heredado) y el contenido se adapta sin romper el layout. — ok: 390×844 top bar + FAB visibles, drawer abre con nav, sin overflow horizontal (`scrollWidth==innerWidth`) en `/kids` y perfil (`.mcp-playwright/spec-02-mobile-kids.png`, `-mobile-drawer.png`, `-mobile-profile.png`)

## Decisions

- **Sí:** rutas en inglés (`/kids`, `/kids/[id]`) por regla de clean code; **el texto de la UI sigue en español** (fiel a la maqueta).
- **Sí:** carpeta `components/kids/` con subcomponentes (`KidCard`, `ParentRow`, `AllergyBox`, `InfoRow`) + `mockKids.ts`, heredando la convención `components/<feature>/` de SPEC 01.
- **Sí:** navegación real lista→perfil y perfil→lista (son las dos pantallas del spec); `Link` en la tarjeta y en "Volver".
- **No:** rutas para `agregar-nino`/`vincular-padre`/`resumen-dia`/`editar`. Cada una tiene su propio spec; aquí son no-ops para no generar 404.
- **Sí:** `Sidebar`/`AppShell` aceptan `active` (default `"feed"`) para resaltar el ítem correcto por ruta; evita duplicar la sidebar y no rompe el feed.
- **Sí:** buscador funcional (state `query`) en `page.tsx` como client component. Es barato y hace la pantalla real.
- **Sí:** los 8 niños como array tipado `KIDS`; detalle completo solo para Mateo (ejemplo de la maqueta). Listo para swap a fuente real.
- **No:** hardcodear tarjetas/rows en JSX. Repetitivo.
- **No:** base de datos, API, auth, validaciones. Fuera del scope "solo interfaces y componentes".

## Risks

| Risk | Mitigation |
| --- | --- |
| Modificar `Sidebar`/`AppShell` (compartidos con el feed) puede romper SPEC 01 | `active` es opcional con default `"feed"`; el feed no cambia de comportamiento. Verificar que `/` sigue con "Feed" activo. |
| La maqueta no tiene diseño mobile, pero el usuario pide responsive | Heredar el comportamiento mobile del `AppShell` ya validado en SPEC 01 (top bar + drawer + FAB); el contenido se adapta. Es una extensión sensible, no un claim de fidelidad. |
| Perfil de 7 niños sin detalle definido en la maqueta | Definir edad/sala/padres mínimos para que el perfil se renderice; solo Mateo es el ejemplo completo verificado 1:1. |
| `/kids/[id]` con un id inexistente | Mostrar un estado vacío (mensaje + botón volver), sin romper la página. |

## What is **not** in this spec

- `agregar-nino`, `vincular-padre`, `resumen-dia`, `editar` (sus botones son no-ops).
- Autenticación / login.
- Base de datos, API, estado real de padres.

Cada una de esas, si llega, va en su propio spec.
