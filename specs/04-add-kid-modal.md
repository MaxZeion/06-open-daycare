# SPEC 04 — Modal "Agregar niño"

> **Status:** Implementado
> **Depends on:** SPEC 01 (tokens, fuentes, AppShell), SPEC 02 (área kids, modelo `Kid`)
> **Date:** 2026-09-25
> **Objective:** Implementar el modal del botón "Agregar niño" en `/kids` fiel a la maqueta `pantallas/agregar-nino.dc.html`, con máscara de fecha española (dd/mm/aaaa), validación de los 3 campos obligatorios (nombre, fecha, sala) y alta del niño en la lista en memoria.

## Why this spec exists

SPEC 02 dejó el botón "Agregar niño" como no-op visual. Este spec lo hace real: abre un modal que replica la maqueta `agregar-nino.dc.html` y, al guardar, agrega el niño a la grilla como estado en memoria (sin backend, coherente con los mocks del proyecto). Es el primer spec con un formulario con validación y el primer modal de la app.

## Scope

**In:**

- Modal sin overlay oscuro (la tarjeta flota sobre la página, tal cual el ejemplo) que se abre desde el botón "Agregar niño" de `/kids` y se cierra con "Cancelar", clic fuera o Esc.
- Tarjeta fiel a la maqueta: header (Cancelar / "Agregar niño" / Guardar) + NOMBRE COMPLETO, fila FECHA DE NACIMIENTO + SALA, ALERGIAS (ETIQUETAS), NOTAS MÉDICAS.
- Máscara de fecha en formato español `dd/mm/aaaa` (auto-insertión de barras, solo dígitos) para la fecha de nacimiento.
- Validación: nombre, fecha de nacimiento y sala son **obligatorios** (fecha debe existir y no ser futura); alergias y notas médicas son **opcionales**. "Guardar" queda siempre habilitado: al hacer clic, los obligatorios inválidos se marcan en rojo (borde + mensaje) hasta que se corrijan, y si son válidos se guarda.
- SALA: `<select>` nativo estilizado con 4 opciones — Soles (default), Lunas, Nubes, Estrellas.
- Guardar: construye el `Kid` (id, inicial, avatar por paleta rotativa, edad derivada de la fecha, sala, `parentsCount: 0`, alergias mapeadas, `medicalNotes`) y lo agrega a la lista **en memoria** (primero en la grilla); el contador del divisor y el buscador lo incluyen.
- Mobile (< 768px): tarjeta a ancho completo con márgenes de 16px, centrada verticalmente, scroll interno si excede la altura.

**Out of scope (para specs futuros):**

- Persistencia: el niño agregado se pierde al recargar o al navegar.
- Render de perfil para niños nuevos: clic en la tarjeta nueva → `/kids/[id]` muestra el estado vacío existente (id desconocido).
- Render de `medicalNotes` en el perfil (solo se guarda).
- `editar-nino`, `vincular-padre` y `resumen-dia` (cada una, su propio spec).
- Secciones por sala en la grilla (el divisor "SALA SOLES" sigue siendo único; su contador pasa a reflejar el total de la lista).
- Backend / API / base de datos.

## Data model

```ts
// components/kids/mockKids.ts (modificaciones, aditivas)
export const SALAS = ["Soles", "Lunas", "Nubes", "Estrellas"] as const;
export type Sala = (typeof SALAS)[number];

// Los 5 colores únicos de la paleta existente, para avatares de niños nuevos:
export const AVATAR_PALETTE: Kid["avatar"][] = [
  { bg: "var(--avatar-mateo-bg)", fg: "var(--avatar-mateo-fg)" },
  { bg: "var(--avatar-sofia-bg)", fg: "var(--avatar-sofia-fg)" },
  { bg: "var(--avatar-benjamin-bg)", fg: "var(--avatar-benjamin-fg)" },
  { bg: "var(--avatar-valentina-bg)", fg: "var(--avatar-valentina-fg)" },
  { bg: "var(--avatar-tomas-bg)", fg: "var(--avatar-tomas-fg)" },
];

export function buildKidId(name: string): string; // "Martina López" → "martina-lopez" (minúsculas, sin acentos, guiones)

// components/kids/dateMask.ts (nuevo)
export function applyDateMask(raw: string): string;            // "12032022" → "12/03/2022" (solo dígitos, barras automáticas)
export function parseSpanishDate(value: string): Date | null;   // null si mal formada, inexistente (31/02/2021) o futura
export function ageFromBirthDate(birthDate: Date): number;      // años cumplidos
```

Cambio al tipo `Kid` (aditivo): `medicalNotes?: string` — se guarda desde el modal; el perfil no la renderiza aún.

Convenciones:

- `birthDate` del niño nuevo se guarda **tal cual se tecleó** (`"12/03/2022"`), por decisión explícita; el perfil lo muestra en crudo (Mateo sigue con `"12 mar 2022"`).
- Edad: años cumplidos derivados de la fecha parseada, calculados al guardar.
- Alergias: el texto libre se guarda en `allergyNotes` (si no está vacío); si contiene "maní" (case/acent-insensitive) → `allergy: "maní"`, si no y contiene "lactosa" → `"lactosa"`, si no → `undefined`.
- `parentsCount: 0` y `parents: []` → la lógica existente de `KidCard` muestra badge naranja si hay alergia y badge rosa VINCULAR si no.
- Avatar: `initials` = primera letra del primer nombre (mayúscula); color = `AVATAR_PALETTE[nº de niños agregados en la sesión % 5]`.

## Design tokens (nuevos en `app/globals.css`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--modal-bg` | `#FBF4EC` | fondo de la tarjeta (mismo valor que `--bg-auth`, con nombre propio para no mezclar semánticas) |
| `--shadow-modal` | `0 20px 50px -24px rgba(63,54,46,.35)` | sombra de la tarjeta (idéntica a la maqueta) |
| `--field-bg` | `#FFFFFF` | fondo de inputs/select/textarea del modal |
| `--field-chevron` | `#B0A290` | trazo del chevron del selector de sala |
| `--field-placeholder` | `#B6A99B` | color de placeholder de los campos |
| `--field-error` | `#C5413A` | borde/mensaje de error de campos del modal (mismo valor que `--alert-title`, con nombre propio para no mezclar semánticas) |

Se reutilizan tal cual: `--border` (`#ECE0D0`, borde de tarjeta y header), `--input-border` (`#EADFD0`, borde de campos, de SPEC 03), `--muted-strong` (`#94887B`, labels y "Cancelar"), `--ink`, `--accent` (`#D9583C`, "Guardar").

## Implementation plan

```
components/
  shared/
    icons.tsx          # (mod) agregar ChevronDownIcon
  kids/
    dateMask.ts        # (nuevo) applyDateMask, parseSpanishDate, ageFromBirthDate
    mockKids.ts        # (mod) SALAS, AVATAR_PALETTE, buildKidId, medicalNotes? en Kid
    AddKidModal.tsx    # (nuevo) modal completo
app/
  globals.css          # (mod) tokens de la tabla + alias @theme
  kids/
    page.tsx           # (mod) abrir modal, addedKids, lista combinada, contador
```

1. `app/globals.css`: agrego los tokens nuevos de la tabla (+ alias `@theme`). *Funcional: compila.*
2. `components/shared/icons.tsx`: agrego `ChevronDownIcon` (mismo trazo de la maqueta `m6 9 6 6 6-6`, `strokeWidth` 2.2). *Funcional.*
3. `components/kids/dateMask.ts`: `applyDateMask` (extrae dígitos, forma `dd/mm/aaaa`), `parseSpanishDate` (`Date | null`; `null` si mal formada, inexistente o futura) y `ageFromBirthDate`. *Funcional.*
4. `components/kids/mockKids.ts`: `SALAS`, `AVATAR_PALETTE`, `buildKidId` + campo `medicalNotes?` en `Kid`. *Funcional: cambios puramente aditivos, SPEC 02 intacto.*
5. `components/kids/AddKidModal.tsx` (client): `createPortal` a `document.body`; capa transparente a pantalla completa (clic fuera → cerrar, lock de scroll del body); tarjeta (max 520px, tokens nuevos, overflow hidden) con header y los 5 campos fieles a la maqueta; estado local de los 5 campos; máscara en el input de fecha (`inputMode="numeric"`, `maxLength=10`); "Guardar" siempre habilitado: al hacer clic, valida nombre/fecha y, si hay inválidos, los marca en rojo (borde `--field-error` + mensaje) hasta corregirlos; listener `keydown` para Esc; si son válidos, `onSave(kid)` + reset del formulario; mobile: ancho completo con márgenes 16px, `max-h` con scroll interno. *Funcional: compila (aún no usado).*
6. `app/kids/page.tsx`: state `addOpen` (el botón "Agregar niño" lo abre) y `addedKids: Kid[]`; lista combinada `addedKids + KIDS` (los nuevos primero) alimenta grilla, buscador y contador del divisor; renderiza `<AddKidModal>` dentro del `AppShell`. *Funcional: flujo completo.*

## Acceptance criteria

- [x] `npm run lint` y `npm run build` pasan sin errores. — ok: `npm run lint` (exit 0, sin warnings) + `npm run build` (Next 16.3.6 Turbopack, "Compiled successfully in 314ms", 7/7 páginas generadas).
- [x] En `/kids`, "Agregar niño" abre el modal: tarjeta max 520px, bg `#FBF4EC`, borde `#ECE0D0`, radius 24, sombra de la maqueta, **sin overlay oscuro**; la página queda visible detrás. — ok: computed styles en runtime: bg `rgb(251,244,236)`, border `rgb(236,224,208)`, radius `24px`, box-shadow `rgba(63,54,46,0.35) 0 20px 50px -24px`; `/kids` page visible detrás; screenshot `.mcp-playwright/spec-04-modal-open-desktop.png` vs maqueta `.mcp-playwright/spec-04-mockup-agregar-nino.png`.
- [x] Modal desktop fiel a la maqueta: header (Cancelar `#94887B` 15px/700, "Agregar niño" Fredoka 18px/600, Guardar `#D9583C` 15px/800), labels 12px/800 con tracking `.7px` (`#94887B`), placeholders ("Ej. Martina López", "dd/mm/aaaa", "Ej. Maní, Lactosa", "Indicaciones, medicación, contactos…") en `#B6A99B`, inputs padding 13/16 radius 14 borde 1.5px `#EADFD0` bg `#fff`, fila fecha+sala con gap 14, select con chevron `#B0A290`, textarea 90px resizable. — ok: computed styles verificados en runtime (cancel rgb(148,136,123)/15px/700; title Fredoka 18px/600; save rgb(217,88,60)/15px/800; label 12px/800/letter-spacing 0.7px; placeholder rgb(182,169,155); input padding 13px 16px / radius 14px / border 1.5px rgb(234,223,208) / bg #fff; textarea min-height 90px / resize vertical; chevron rgb(176,162,144)); screenshot `.mcp-playwright/spec-04-modal-open-desktop.png` vs `.mcp-playwright/spec-04-mockup-agregar-nino.png`.
- [x] Máscara de fecha: teclear `12032022` muestra `12/03/2022`; las letras se ignoran; backspace funciona; máximo 10 caracteres. — ok: tras `fill('12032022')` el `value` del input es `"12/03/2022"` (Playwright); `applyDateMask` extrae dígitos y descarta letras (`raw.replace(/\D/g, "").slice(0, 8)`); `maxLength={10}` en el input.
- [x] Clic en "Guardar" con nombre vacío y/o fecha inválida (`31/02/2021`, `01/01/2027` o incompleta) **no agrega** nada y marca los inválidos en rojo (borde + mensaje: "Introduce nombre y apellido (mínimo 3 caracteres en el nombre)." / "Completa la fecha (dd/mm/aaaa)." / "Fecha no válida."); al corregirlos, la marca desaparece en vivo y un nuevo clic guarda. — ok: probado con nombre vacío + `31/02/2021` → "Introduce nombre y apellido (mínimo 3 caracteres en el nombre)." + "Fecha no válida." (`spec-04-validation-errors.png`); con `01/01/2027` (futura) → "Fecha no válida."; con `12/03` (incompleta) → "Completa la fecha (dd/mm/aaaa)."; al corregir (Martina López + 15032022) la marca desaparece en vivo y un nuevo clic guarda el niño.
- [x] SALA: `<select>` nativo con Soles (default), Lunas, Nubes, Estrellas; estilizado como la caja de la maqueta (texto 15px/700 + chevron), sin el render nativo del select. — ok: snapshot del DOM confirma 4 opciones en el `<select>` (`Soles [selected]`, `Lunas`, `Nubes`, `Estrellas`); clases `appearance-none` + `ChevronDownIcon` (svg `m6 9 6 6 6-6`, stroke `#B0A290`).
- [x] Guardar con (nombre, fecha, sala, alergias "Maní", notas) agrega la tarjeta nueva **primero** en la grilla: avatar con inicial + color de paleta, nombre, edad derivada, badge naranja MANÍ; el divisor pasa a "… 9 niños"; el buscador la encuentra; el modal se cierra y al reabrir los campos están vacíos. — ok: tras guardar "Martina López / 15/03/2022 / Lunas / Maní / nota" el grid muestra Martina primero con avatar celeste (paleta mateo, addedCount=0), "4 años · sin padres vinculados" y badge "MANÍ"; contador "9 niños"; `query "Camila"` después filtra correctamente; al reabrir el modal todos los inputs/textarea están vacíos y `select` vuelve a "Soles" (Playwright DOM check).
- [x] Sin alergia reconocida, la tarjeta nueva muestra badge rosa VINCULAR (lógica existente de `KidCard` con `parentsCount 0`). — ok: tras guardar "Camila Pérez / 01/01/2021 / Soles / sin alergias" aparece badge "VINCULAR" (`spec-04-camila-vincular.png`); mismo resultado en mobile con "Diego Soto" (`spec-04-mobile-after-save.png`).
- [x] "Cancelar", clic fuera y Esc cierran el modal sin agregar nada (lista y contador intactos). — ok: Cancelar → modal cerrado + contador sigue en 9; clic fuera (parent del dialog) → modal cerrado; Esc → modal cerrado + body overflow vuelve a `""` (Playwright).
- [x] Mobile 390×844: tarjeta a ancho completo (márgenes 16px), centrada verticalmente, scroll interno si excede la altura, sin overflow horizontal; el flujo de guardado funciona igual. — ok: `getBoundingClientRect()` con viewport 390×844 devuelve x=16, width=358, max-height 812px (= 100dvh-32px), card overflow hidden con inner div `overflow-y: auto`; guardado de Diego Soto funciona en mobile (`spec-04-modal-mobile.png` + `spec-04-mobile-after-save.png`).
- [x] Clic en la tarjeta nueva navega a `/kids/[id]` y muestra el estado vacío existente (id no presente en `KIDS`), sin 404 ni errores en consola. — ok: `/kids/camila-perez` renderiza `NotFound` ("No encontramos a este niño" + "Volver a Niños"); `browser_console_messages` errors=0 (`spec-04-profile-not-found.png`).
- [x] Regresión: `/`, `/kids` (8 tarjetas + buscador), `/kids/mateo-fernandez`, `/login` y `/activate` renderizan sin errores de consola. — ok: las 5 rutas devuelven 200, renderizan y `browser_console_messages level=error` devuelve 0 mensajes (`spec-04-regression-home.png`, `spec-04-regression-mateo.png`, `spec-04-regression-login.png`, `spec-04-regression-activate.png` + `/kids` cuenta 8 tarjetas y buscador funcional).
- [x] Colores y fuentes: tokens nuevos aplicados (bg tarjeta `#FBF4EC`, placeholder `#B6A99B`, chevron `#B0A290`, sombra); Fredoka en el título del modal, Nunito en el resto. — ok: title `font-family: Fredoka`; inputs/textarea/labels `font-family: Nunito`; tokens CSS `--modal-bg`, `--field-bg`, `--field-chevron`, `--field-placeholder`, `--field-error`, `--shadow-modal` declarados en `app/globals.css` con alias `@theme inline` (`color-modal-bg`, etc.) y referenciados en `AddKidModal.tsx` (`bg-modal-bg`, `text-field-chevron`, etc.).

## Decisions

- **Sí:** Guardar agrega a la lista **en memoria** (state de la página `/kids`); al recargar vuelven los 8 mocks. Decidido por el usuario.
- **No:** context/provider para que el perfil renderice al niño nuevo — cambio mayor sobre las páginas de SPEC 02; el perfil del nuevo usa el estado vacío existente.
- **Sí:** `<select>` nativo estilizado para SALA — accesible y robusto; su estado cerrado es idéntico a la maqueta. Decidido por el usuario.
- **No:** dropdown personalizado — mismo resultado visual con más estados y JS.
- **Sí:** máscara `dd/mm/aaaa` con validación de **fecha real existente y no futura** — la edad de la tarjeta se deriva de ella. Decidido por el usuario.
- **No:** `<input type="date">` — su display depende del locale y no da la máscara española pedida.
- **Sí:** `birthDate` se guarda **tal cual se tecleó** (`dd/mm/aaaa`) — decisión del usuario; consecuencia: el perfil del niño nuevo muestra la fecha en crudo (Mateo sigue en "12 mar 2022"). Se unificará cuando llegue un backend.
- **Sí:** sin overlay oscuro — la tarjeta flota sobre la página con su propia sombra de la maqueta; la capa a pantalla completa es transparente, solo para capturar el clic fuera. Decidido por el usuario ("el mismo que en el ejemplo").
- **Sí:** cierra con "Cancelar", clic fuera **y Esc** — confirmado por el usuario.
- **Sí:** "Guardar" **siempre habilitado**: al hacer clic valida nombre y fecha (sala trae default) y, si hay inválidos, los marca en rojo (borde + mensaje) hasta corregirlos; sin estados de error previos al primer clic. Decidido por el usuario (revirtió la versión anterior de disabled sin errores).
- **Sí:** salas nuevas **Lunas, Nubes, Estrellas** — tema celeste que continúa a Soles. Decidido por el usuario.
- **Sí:** alergias = texto libre → `allergyNotes`; "maní"/"lactosa" (case/acent-insensitive) activan el badge naranja; el resto no. Decidido por el usuario.
- **Sí:** NOTAS MÉDICAS se guarda en un nuevo campo aditivo `medicalNotes?` de `Kid` (el perfil no la renderiza aún) — no se pierde el dato sin tocar la renderización de SPEC 02.
- **Sí:** `createPortal` a `document.body` — evita que transforms/overflow de `AppShell` (drawer mobile) rompan el `position: fixed`.
- **Sí:** los niños nuevos van **al principio** de la grilla y el contador del divisor refleja el total (aunque la sala elegida sea otra).
- **No:** persistencia (localStorage/IndexedDB) — no hay "guardado real" en el proyecto todavía.

## Risks

| Risk | Mitigation |
| --- | --- |
| Modificar `Kid`/`mockKids.ts` puede romper SPEC 02 | Cambios puramente aditivos (campo opcional + constantes); criterio de regresión explícito para `/kids` y el perfil de Mateo. |
| `globals.css` e `icons.tsx` son compartidos | Tokens e icono nuevos, sin tocar existentes; criterio de regresión para `/` y `/login`. |
| `position: fixed` dentro de un ancestro con transform (drawer del `AppShell` mobile) | `createPortal` a `document.body`. |
| La maqueta es desktop-only | Mobile definido como extensión sensible (ancho completo, scroll interno); no es claim de fidelidad, igual que en SPEC 01–03. |
| Perfil del niño nuevo (id desconocido) | Ya existe el estado vacío de SPEC 02; criterio explícito de que no dé 404. |
| Formato mixto de `birthDate` en el perfil (crudo `dd/mm/aaaa` vs "12 mar 2022") | Aceptado como trade-off de guardar tal cual; documentado para el spec de backend. |

## What is **not** in this spec

- Persistencia del niño agregado (recargar → 8 mocks).
- Render de perfil para niños nuevos (usa el estado vacío existente).
- `medicalNotes` en el perfil.
- `editar-nino`, `vincular-padre`, `resumen-dia`.
- Secciones por sala, backend, API, auth.

Cada una de esas, si llega, va en su propio spec.
