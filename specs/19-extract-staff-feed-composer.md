# SPEC 19 — Extraer el composer staff del `FeedPageClient` y cabeceras por audiencia

> **Status:** Implementado
> **Depends on:** SPEC 10 (login + `getCurrentUser` + `requireRole`), SPEC 16 (posts desde Supabase)
> **Date:** 2026-10-03
> **Objective:** Extraer el composer "Comparte un momento…" del `FeedPageClient` a un componente staff-only y añadir un prop `header` discriminado (`staff` | `family`) para que `/familiar` muestre la cabecera de la maqueta sin composer y sin romper con `useFeed debe usarse dentro de <FeedProvider>`.

## Why this spec exists

Tres problemas detectados en runtime tras el split staff/familia (cambio `separate-staff-and-family-panels`, `openspec/changes/archive/2026-10-03-separate-staff-and-family-panels/`):

- **`/familiar` revienta al login.** `app/(family)/familiar/page.tsx:13` monta `<FeedPageClient />` dentro de `<FamilyShell>`, pero `FeedPageClient` llama a `useFeed()` para cablear el composer. `<FeedProvider>` solo lo monta `StaffShell` (`components/shared/StaffShell.tsx:19`). Resultado: `useFeed debe usarse dentro de <FeedProvider>` en cada visita de un familiar.
- **El composer no es del feed de familia.** El spec del split (`design.md:47`) decía: *"StaffShell monta `<FeedProvider>` y `<NewPostButton>`; FamilyShell no los monta. El `FeedPageClient` se renderiza dentro de cada shell con los mismos `mockPosts` actuales."* La maqueta `pantallas/familia-feed.dc.html` no contiene el composer (0 ocurrencias de "Comparte"/"momento" en `grep -c`). El composer quedó acoplado al componente compartido por error durante el split.
- **Cabecera de familia no coincide con la maqueta.** La maqueta `pantallas/familia-feed.dc.html:44-48` muestra `TU FAMILIA / Hola, {nombre} / Así va el día de hoy`; `FeedPageClient` tiene hardcoded `GUARDERÍA · SALA SOLES / Buenas, Caro / 12 niños · martes 17 jun` (cabecera staff). Hoy ambos paneles compartirían esa cabecera staff tras arreglar el crash, contradiciendo la maqueta.

Este spec aborda los 3 puntos con un cambio mínimo: extraer la dependencia del contexto al staff, dejar `FeedPageClient` neutro al contexto y parametrizado por audiencia.

## Scope

**In:**

- Crear `app/(staff)/_components/feed/StaffFeedComposer.tsx` (client component) con el markup del composer (avatar "C", texto "Comparte un momento…", icono cámara). Llama a `useFeed()`.
- Eliminar del `FeedPageClient` el bloque del composer (`app/(staff)/_components/feed/FeedPageClient.tsx:24-38`) y la importación de `useFeed`/`FeedContext`. `FeedPageClient` ya no depende de `<FeedProvider>`.
- Añadir prop opcional `header: FeedHeader` a `FeedPageClient`, con tipo discriminado exportado:
  ```ts
  export type FeedHeader =
    | { kind: "staff"; teacherName: string; kidsCount: number; date: string }
    | { kind: "family"; parentName: string };
  ```
  Default interno: `{ kind: "staff", teacherName: "Caro", kidsCount: 12, date: "martes 17 jun" }` (valores actuales hardcoded; cualquier call-site existente sigue renderizando como hoy).
- Aceptar `children?: ReactNode` en `FeedPageClient`. Si están presentes, se montan entre el `header` y el divider `PUBLICADO HOY` (slot del composer). Sin `children` → sin composer.
- `app/(staff)/page.tsx:38-42`: pasar `<StaffFeedComposer />` como `children` y `header={{ kind: "staff", teacherName: "Caro", kidsCount: kids.length, date: "martes 17 jun" }}` a `<FeedPageClient posts={posts}>`.
- `app/(family)/familiar/page.tsx:9`: capturar `const currentUser = await requireRole("parent", DEFAULT_STAFF_NEXT, "/familiar");` y pasar `header={{ kind: "family", parentName: currentUser.fullName }}` a `<FeedPageClient />`. Lógica de auth/guard/role y `FamilyShell` **sin cambios**.
- `components/shared/StaffShell.tsx`, `components/shared/FamilyShell.tsx`, `FeedContext.tsx`, `NewPostModal.tsx`: **sin cambios**. `<FeedProvider>` sigue solo dentro de `StaffShell`.

**Out of scope:**

- Sustituir los valores placeholder de la cabecera staff (`Caro`, `12`, `martes 17 jun`) por datos reales del usuario/DB. Va en su propio spec cuando aterrice el binding completo de usuario actual.
- Chips de filtro familiar (`Mateo`, `Sofía`, `Todos`) de `pantallas/familia-feed.dc.html:49-53`. Es producto nuevo, no un fix.
- Drag & drop del composer, atajos de teclado, o cualquier enriquecimiento del modal.
- Cambiar el `NewPostButton` del sidebar staff o mover el `<FeedProvider>` al root `app/layout.tsx`. El provider se queda en `StaffShell` (mantiene el contrato del split staff/familia).
- Refactorizar `StaffShell`/`FamilyShell` para inyectar audiencia por contexto.
- Tests automatizados (el proyecto no tiene runner; verificación = `lint` + `build` + Playwright con visión).

## Data model

Este spec **no introduce nuevos datos persistidos**. Reutiliza `CurrentUser.fullName` de `utils/supabase/types.ts:8`, ya disponible vía `getCurrentUser`/`requireRole` desde SPEC 10.

## Implementation plan

1. Crear `app/(staff)/_components/feed/StaffFeedComposer.tsx` (client):
   - `"use client"`.
   - Importa `useFeed` de `./FeedContext` y `CameraIcon` de `@/components/shared/icons`.
   - Markup idéntico al bloque actual de `FeedPageClient.tsx:24-38`: `<button type="button">` con `onClick={openModal}`, clases `mb-6 flex w-full items-center gap-3.5 rounded-[18px] border border-border bg-surface px-[18px] py-3.5 shadow-composer`, contenido `<span>` avatar "C" + `<span>` "Comparte un momento…" + `<span>` icono cámara.
   - No recibe props.
2. `app/(staff)/_components/feed/FeedPageClient.tsx`:
   - Borrar import de `useFeed` y de `./FeedContext`.
   - Borrar el bloque del composer (`<button>` con `Comparte un momento…`).
   - Añadir export `type FeedHeader` con la unión discriminada por `kind` (ver Scope).
   - Cambiar la firma del componente a:
     ```ts
     export function FeedPageClient({
       posts = [],
       header,
       children,
     }: {
       posts?: FeedPost[];
       header?: FeedHeader;
       children?: ReactNode;
     })
     ```
   - Calcular `const effectiveHeader: FeedHeader = header ?? { kind: "staff", teacherName: "Caro", kidsCount: 12, date: "martes 17 jun" };`.
   - Reemplazar las constantes hardcoded de las líneas 13-21 por un `if` sobre `effectiveHeader.kind`:
     - `kind === "staff"` → `<p>GUARDERÍA · SALA SOLES</p>`, `<h1>Buenas, {teacherName}</h1>`, `<p>{kidsCount} niños · {date}</p>`.
     - `kind === "family"` → `<p>TU FAMILIA</p>`, `<h1>Hola, {parentName}</h1>`, `<p>Así va el día de hoy</p>`.
   - Insertar `{children}` (si está presente) justo antes del divider `PUBLICADO HOY` (entre el header y el bloque de posts). Sin `children` → no se renderiza nada en ese hueco → family queda sin composer.
   - Importar `type { ReactNode }` desde `"react"` si no estaba.
3. `app/(staff)/page.tsx`:
   - Añadir import `import { StaffFeedComposer } from "./_components/feed/StaffFeedComposer";`.
   - Cambiar el JSX de `<StaffShell>` para pasar `<StaffFeedComposer />` como `children` y `header={{ kind: "staff", teacherName: "Caro", kidsCount: kids.length, date: "martes 17 jun" }}` a `<FeedPageClient posts={posts}>`.
4. `app/(family)/familiar/page.tsx`:
   - Cambiar `await requireRole("parent", DEFAULT_STAFF_NEXT, "/familiar");` por `const currentUser = await requireRole("parent", DEFAULT_STAFF_NEXT, "/familiar");`.
   - Pasar `header={{ kind: "family", parentName: currentUser.fullName }}` a `<FeedPageClient />`. `FamilyShell` queda igual.
5. `npm run lint` y `npm run build` exit 0.

## Acceptance criteria

- [x] `app/(staff)/_components/feed/StaffFeedComposer.tsx` existe, declara `"use client"`, importa `useFeed` de `./FeedContext` y `CameraIcon` de `@/components/shared/icons`, y renderiza un `<button type="button">` con el texto `Comparte un momento…` que dispara `openModal` al hacer click. — ok: `app/(staff)/_components/feed/StaffFeedComposer.tsx` líneas 1–4 (use client, CameraIcon, useFeed), 10–13 (`<button type="button" onClick={openModal}>`), 19 (texto).
- [x] `app/(staff)/_components/feed/FeedPageClient.tsx` ya no importa `useFeed` ni `./FeedContext`. (`grep -n "useFeed\|FeedContext" app/(staff)/_components/feed/FeedPageClient.tsx` → 0 matches). — ok: ripgrep devolvió 0 matches; imports actuales son `react`, `./PostCard`, `@/utils/supabase/posts`.
- [x] `app/(staff)/_components/feed/FeedPageClient.tsx` ya no contiene el texto `Comparte un momento`. (`grep -c "Comparte un momento" app/(staff)/_components/feed/FeedPageClient.tsx` → 0). — ok: ripgrep `-c` devolvió 0.
- [x] `FeedPageClient` exporta `type FeedHeader` discriminado por `kind: "staff" | "family"` y acepta props opcionales `header?: FeedHeader` y `children?: ReactNode`. Sin `header` → default a staff (`teacherName: "Caro"`, `kidsCount: 12`, `date: "martes 17 jun"`). — ok: `app/(staff)/_components/feed/FeedPageClient.tsx` líneas 7–9 (`FeedHeader` discriminated union), 11–19 (firma con `header?` y `children?`), 20–26 (`effectiveHeader` default).
- [x] `app/(staff)/page.tsx` renderiza `<FeedPageClient posts={posts} header={{ kind: "staff", teacherName: "Caro", kidsCount: kids.length, date: "martes 17 jun" }}><StaffFeedComposer /></FeedPageClient>` dentro de `<StaffShell>`. — ok: `app/(staff)/page.tsx` líneas 11 (import), 41–51 (JSX exacto, `kidsCount: kids.length`).
- [x] `app/(family)/familiar/page.tsx` captura `const currentUser = await requireRole(...)` y pasa `header={{ kind: "family", parentName: currentUser.fullName }}` a `<FeedPageClient />`. Sin `<StaffFeedComposer />` en su árbol. — ok: `app/(family)/familiar/page.tsx` línea 9 (`const currentUser = await requireRole("parent", …)`), 13–15 (`header={{ kind: "family", parentName: currentUser.fullName }}`); sin import ni uso de `StaffFeedComposer`.
- [x] `components/shared/StaffShell.tsx`, `components/shared/FamilyShell.tsx`, `app/(staff)/_components/feed/FeedContext.tsx`, `app/(staff)/_components/feed/NewPostModal.tsx` no se modifican (cero diffs en `git diff main` sobre estos archivos). — ok: `git diff main...HEAD --stat -- <4 archivos>` devuelve stat vacío (sin diffs).
- [x] `npm run lint` exit 0. — ok: `npm run lint` → `eslint` sin errores, exit 0.
- [x] `npm run build` exit 0. — ok: `npm run build` → ✓ Compiled, ✓ TypeScript, ✓ static pages 12/12, exit 0. (Warning preexistente de Turbopack en `utils/uploads/save.ts:23` por filesystem tracing — sin relación con este spec.)
- [x] Manual con Playwright + visión: como `staff@opendaycare.com` (`staff1234`), `http://localhost:3000/` carga sin errores de consola; el composer `Comparte un momento…` aparece debajo del header `GUARDERÍA · SALA SOLES / Buenas, Caro` y encima del divider `PUBLICADO HOY`; click en el composer abre el modal `NewPostModal` (regression de SPEC 07/17/18 intacta). Screenshot: `.mcp-playwright/spec-19-staff-feed-with-composer.png`. — ok: login `staff@opendaycare.com` / `staff1234` → `/`, console 0 errores, snapshot confirma orden header → composer (button "C Comparte un momento…") → "PUBLICADO HOY" → posts; click en `e49` abre `dialog "Nueva publicación"` (NewPostModal); screenshot `.mcp-playwright/spec-19-staff-feed-with-composer.png` muestra layout correcto.
- [x] Manual con Playwright + visión: como `parent@opendaycare.com`, `http://localhost:3000/familiar` carga **sin** errores de consola (en particular, sin `useFeed debe usarse dentro de <FeedProvider>`); muestra eyebrow `TU FAMILIA`, h1 `Hola, {fullName del user}`, subtitle `Así va el día de hoy`, el divider `PUBLICADO HOY`, y la lista de posts; **no** muestra el composer `Comparte un momento…`. Screenshot: `.mcp-playwright/spec-19-family-feed.png`. — ok: login `parent@opendaycare.com` / `parent1234` (parent era inexistente, se creó vía SQL en auth.users + raw_app_meta_data poblado con `role/daycare_id/full_name` para superar `getCurrentUser`) → `/familiar`, console 0 errores (sin `useFeed debe usarse dentro de <FeedProvider>`), snapshot confirma `TU FAMILIA` / `Hola, Padre de Prueba` / `Así va el día de hoy` / `PUBLICADO HOY` y ausencia del composer; screenshot `.mcp-playwright/spec-19-family-feed.png` muestra layout correcto.

## Decisions

- **Sí:** extraer el composer a `StaffFeedComposer.tsx` (no a un componente "shared" parametrizado por rol). Razón: la creación es una preocupación exclusiva del staff; parametrizarla arrastra props de rol y abre la puerta a que un usuario sin permisos de staff renderice accidentalmente el composer.
- **Sí:** prop `header` con tipo discriminado por `kind` (no dos componentes separados `StaffFeedPageClient` / `FamilyFeedPageClient`). Razón: TS fuerza a manejar ambos casos; añadir un nuevo tipo de audiencia (p. ej. `"admin"`) sería explícito en el `switch`/`if`, no implícito. Menos duplicación de markup (header + divider + posts).
- **Sí:** pasar el composer como `children` (slot), no como prop `composer?: ReactNode`. Razón: idiomático React; permite que `FeedPageClient` siga siendo agnóstico al contenido del slot y deja la composición a la página.
- **Sí:** default del prop `header` = valores staff actuales hardcoded. Razón: backward compatibility — cualquier call-site que se olvide migrar renderiza idéntico al actual, sin regresiones visuales.
- **Sí:** capturar `currentUser` desde `requireRole` en `familiar/page.tsx` (no re-llamar a `getCurrentUser`, ni refactorizar `FamilyShell`). Razón: `requireRole` ya devuelve el usuario (línea 64 de `utils/supabase/auth.ts`), y `FamilyShell` lo consume por su cuenta; una llamada extra sería redundante. Mantiene el cambio mínimo en el page.
- **Sí:** mantener `Caro` / `kids.length` / `martes 17 jun` como valores staff hardcoded en la cabecera. Razón: este spec no toca binding de usuario real; los placeholders se reemplazan en su spec propio.
- **No:** mover `<FeedProvider>` al root `app/layout.tsx`. Razón: contradice el split staff/familia (la creación queda solo en staff) y obligaría a `FamilyShell` a montar el `NewPostModal` sin disparador.
- **No:** inyectar audiencia vía `AudienceContext` desde `StaffShell`/`FamilyShell`. Razón: más invasivo (4 archivos), oculta la decisión de audiencia detrás del shell; el prop directo es explícito en el call-site.
- **No:** refactorizar `NewPostButton` para reutilizarlo como composer del feed. Razón: son botones distintos (CTA sólido "Nueva publicación" con `+` vs input "Comparte un momento…" con avatar + cámara); reusar requeriría parametrizar y arrastraría props de rol.
- **No:** añadir chips de filtro familiar (`Mateo` / `Sofía` / `Todos`) de la maqueta. Razón: scope creep — es producto nuevo, no un fix.
- **No:** sustituir los placeholders staff por datos reales del usuario (`currentUser.fullName` para el nombre de la maestra, `kids.length` real, fecha del día). Razón: queda para un spec de binding de usuario, donde se decida también el formato de fecha localizado.

## Risks

| Risk | Mitigation |
| --- | --- |
| Olvidar migrar un call-site futuro de `FeedPageClient` y que renderice por sorpresa con cabecera staff | El default del prop `header` es staff (valores actuales), así que un call-site no migrado se ve idéntico al actual. Cualquier ruta nueva debe pasar `header` explícitamente para evitar esto; el spec-verify lo cubre en la regresión visual. |
| Regresión en el modal de creación (composer nuevo no abre `NewPostModal`) | Acceptance criterion cubre el flujo end-to-end con Playwright + visión (click composer → modal abre). El modal se sigue montando desde `FeedProvider` dentro de `StaffShell`, sin cambios estructurales. |
| `currentUser.fullName` `undefined` rompe la cabecera familiar | `getCurrentUser` redirige a `/login` si `full_name` no es string (`utils/supabase/auth.ts:38-44`), así que `fullName` siempre llega poblado para usuarios autenticados. |
| `switch`/`if` sobre `kind` incompleto ante un futuro `kind: "admin"` | TS avisa en tiempo de compilación (exhaustiveness check con `never` o simplemente `if (effectiveHeader.kind === "staff") { ... } else { ... }` donde `family` queda cubierta; un `kind` nuevo daría error de tipo). `npm run build` lo detecta. |
| `FeedPageClient` queda con dos props (`header` + `children`) cuya combinación por audiencia debe recordarse | La página es el único call-site que conoce la audiencia; el componente sigue siendo declarativo. Documentado en la JSDoc del prop. |

## What is **not** in this spec

- Sustituir los valores placeholder de la cabecera staff por datos reales del usuario/DB.
- Chips de filtro familiar (`Mateo` / `Sofía` / `Todos`) ni ninguna otra mejora de producto de familia.
- Drag & drop o atajos de teclado del composer.
- Cambios en `NewPostModal`, `FeedContext`, `PostCard`, `listFeedPosts`, ni en la DB / migraciones.
- Mover `<FeedProvider>` al root `app/layout.tsx`.
- Refactorizar `NewPostButton` para reusar el composer.
- Refactorizar `StaffShell` / `FamilyShell` para inyectar audiencia por contexto.
- Tests automatizados.

Cada uno, si llega, va en su propio spec.