# Design

## Context

El proyecto está en Next.js 16 (App Router) con `@supabase/ssr` para sesiones cookie-based y Supabase Auth exponiendo `app_metadata.role`, `app_metadata.daycare_id` y `app_metadata.full_name` vía `getClaims()` (SPEC 09/10). Hoy existe un único árbol `app/` con `getCurrentUser()` que autentica pero no distingue rol; staff y familia aterrizan en el mismo `/` con el mismo `Sidebar` y `NewPostButton` siempre visible. Las maquetas (`pantallas/familia-*.dc.html` vs `pantallas/feed.dc.html`) ya dibujan dos productos visuales distintos. No hay `openspec/specs/` poblado todavía (los `specs/NN-*.md` son la convención local previa).

## Goals / Non-Goals

**Goals:**
- Separar el árbol de rutas en `app/(staff)/` y `app/(family)/` con layouts y shells distintos sin romper `npm run lint` ni `npm run build`.
- Introducir un guard de rol reutilizable (`requireRole`) paralelo al `getCurrentUser` actual.
- Redirigir tras login según el rol del usuario, respetando `?next=` cuando sea coherente.
- Dejar sentada la base para que un cambio posterior traiga contenido específico de familia (filtrado de feed por `post_children`, "Resumen del día" real) sin volver a mover archivos.

**Non-Goals:**
- Endurecimiento de policies RLS multi-tenant (sigue patrón abierto `using (true)`).
- Tabla `posts`, `post_children`, filtrado real del feed por audiencia.
- "Resumen del día" y "Mi cuenta" funcionales (quedan como items deshabilitados en el sidebar de familia).
- Cambios en `pantallas/*.dc.html` (no se tocan maquetas).
- Refactor del `AppShell` en componente único parametrizable (se duplica la estructura para mantener el principio de "dos productos distintos").

## Decisions

### Route groups `(staff)` y `(family)` en lugar de prefijo de URL
- **Decisión**: usar route groups de Next.js App Router (carpetas `(staff)`, `(family)`) que no afectan a la URL visible.
- **Por qué**: las URLs quedan limpias (`/`, `/familiar`, `/kids`, `/login`, `/activate`) y los layouts se aíslan por audiencia sin duplicar prefijos en la barra de direcciones.
- **Alternativas**: prefijos literales (`/staff/`, /family/`) — rechazado porque rompe URLs existentes (`/`, `/kids`) y requiere redirigir a los usuarios staff actuales; un único layout con `if (role)` — rechazado porque acopla el chrome de dos productos en un mismo componente y dificulta crecer cada panel por separado.

### `StaffShell` y `FamilyShell` como componentes separados (no parametrizados)
- **Decisión**: duplicar la estructura `AppShell → ShellClient → Sidebar` en dos archivos (`StaffShell`/`FamilyShell` + `StaffSidebar`/`FamilySidebar`).
- **Por qué**: la nav, el subtítulo del sidebar, el color de avatar y la presencia del `NewPostButton` divergen lo suficiente entre audiencias como para que parametrizar acabe en un archivo con ramas por rol; dos componentes específicos reflejan el principio de "dos productos con el mismo branding".
- **Alternativa**: `AppShell({ role })` con un único `Sidebar({ role })` — rechazado por la misma razón; compartir solo el bloque inferior (avatar + nombre + cerrar sesión) en `UserFooter` si crece la duplicación.
- **Convención de nombres**: se renombran los archivos actuales (`AppShell.tsx`, `AppShellClient.tsx`, `Sidebar.tsx`) a sus variantes `Staff*` para que el código refleje la audiencia.

### Helper `requireRole(role, next?)` en `utils/supabase/auth.ts`
- **Decisión**: añadir `requireRole(role, next?)` que llama a `getCurrentUser(next)` y, si el `claims.app_metadata.role` no coincide, ejecuta `redirect(target)` (parámetro o constante por audiencia).
- **Por qué**: centraliza la lógica de guard de rol en un helper paralelo al `getCurrentUser` ya existente (SPEC 10) y mantiene el patrón "guard al inicio de cada Server Component" que evita mover archivos a un route group de layout.
- **Alternativa**: check inline en cada page (`const u = await getCurrentUser('/'); if (u.role !== 'staff') redirect('/familiar')`) — rechazado por duplicación y por saltarse el helper existente.
- **Decisión secundaria**: la constante `target` por defecto vive junto al helper (`DEFAULT_STAFF_NEXT = '/familiar'`, `DEFAULT_FAMILY_NEXT = '/'`) para que el cambio sea simétrico y trivial.

### `signIn` resuelve destino por rol respetando `?next=`
- **Decisión**: la Server Action `signIn` consulta `getClaims()` tras éxito, y resuelve el destino final con la regla: si `next` está presente y empieza por una ruta coherente con el rol del usuario, respeta `next`; en otro caso, redirige al destino por defecto del rol (`/` para staff, `/familiar` para parent).
- **Por qué**: deep-links entre rutas del mismo rol deben sobrevivir al login (consistente con SPEC 10) pero un `?next=/kids` colgado de un padre no debe exponerle una ruta de staff.
- **Alternativas**: ignorar siempre `?next=` — rechazado por UX; dispatcher en `/` que mira el rol y redirige — redundante con el guard de cada page y añade un redirect extra al primer hit.

### `FeedProvider` y `NewPostButton` solo en el shell de staff
- **Decisión**: `StaffShell` monta `<FeedProvider>` y `<NewPostButton>`; `FamilyShell` no los monta. El `FeedPageClient` se renderiza dentro de cada shell con los mismos `mockPosts` actuales.
- **Por qué**: el contexto de creación de publicación es staff-only; en familia no se crea, solo se consume.
- **Consecuencia**: si en el futuro una pantalla de familia necesita conocer al usuario que creó un post, no dependerá del provider; vendrá del join SQL.

### Mover `app/feed/`, `app/kids/`, `components/feed/`, `components/kids/` dentro de `(staff)/_components/`
- **Decisión**: todos los componentes y rutas que hoy solo usa el personal se mueven a `app/(staff)/_components/{feed,kids}/`. Los que se comparten entre ambos (`mockPosts`, `FeedPageClient`, `icons`, `UserFooter`) quedan en `components/shared/` o en `app/(staff)/_components/` con import desde `(family)`.
- **Por qué**: los route groups admiten cualquier nivel de anidación y los archivos dentro de `_components/` siguen siendo importables; moverlos refleja la audiencia y reduce el riesgo de que un componente "neutro" se monte en el shell equivocado.
- **Alternativa**: dejarlos en `components/{feed,kids}/` — rechazado porque la raíz de `components/` ya no debe implicar uso compartido entre audiencias.

### Endurecimiento de RLS sigue fuera de scope
- **Decisión**: no se endurecen policies en este spec; se mantiene el patrón abierto de SPEC 09/10.
- **Por qué**: el guard de routing ya impide el acceso por UI; endurecer exige el Custom Access Token Hook (ya diferido) y se justifica cuando llegue contenido exclusivo de familia que un padre autenticado pueda intuir desde el cliente. Documentado como riesgo.
- **Mitigación**: el redirect cruzado (`/familiar` ↔ `/`) y los checks de rol en cada page son la primera capa; el filtrado real del feed y el endurecimiento RLS vienen en un cambio posterior.

## Risks / Trade-offs

- **Imports relativos rotos por la refactorización** → mitigación: el cambio se aplica de forma atómica y `npm run build` debe pasar tras cada movimiento de carpeta (no acumular deuda entre movimientos).
- **Padre con sesión intenta query directa a `children` o `parent_children` desde el cliente antes del redirect** → mitigación: aceptable a corto plazo (mismo riesgo que SPEC 09–12); documentado como deuda a cerrar con el endurecimiento RLS.
- **Dos shells duplican el bloque inferior del usuario (avatar + nombre + cerrar sesión)** → mitigación: si crece la duplicación, se extrae a `components/shared/UserFooter.tsx` con prop `subtitle` y `avatarColor`.
- **`FeedProvider` queda acoplado al shell de staff pero `FeedPageClient` lo consume** → mitigación: si en el futuro una pantalla de familia necesita el mismo provider, se mueve el provider al root `app/layout.tsx`; hoy mantenerlo en staff reduce superficie.
- **URL `/familiar` queda vacía de contenido propio (mismo feed mock)** → aceptable: este cambio sienta la base; el contenido diferenciado llega con el filtrado real por `post_children` y "Resumen del día".
- **`NewPostButton` queda en `components/shared/` aunque solo lo use staff** → mitigación: si se quiere sellar al 100%, se mueve a `app/(staff)/_components/shared/NewPostButton.tsx` y se importa solo desde `StaffShell`; el shell de familia ni lo referencia, así que el riesgo es bajo.

## Migration Plan

1. Renombrar `components/shared/AppShell.tsx` → `StaffShell.tsx`, `AppShellClient.tsx` → `StaffShellClient.tsx`, `Sidebar.tsx` → `StaffSidebar.tsx`. Ajustar imports.
2. Mover `app/page.tsx`, `app/feed/`, `app/kids/` a `app/(staff)/{page,kids}/` y `app/(staff)/_components/feed/`. Crear `app/(staff)/layout.tsx`.
3. Mover `components/feed/*` y `components/kids/*` a `app/(staff)/_components/{feed,kids}/` (solo los que staff usa; `mockPosts` puede quedarse en `components/shared/` si se importa desde ambos shells).
4. Crear `components/shared/FamilyShell.tsx`, `FamilyShellClient.tsx`, `FamilySidebar.tsx` con la nav y color del sidebar según maqueta de familia.
5. Crear `app/(family)/layout.tsx` + `app/(family)/page.tsx` que monta `<FeedPageClient />` dentro de `<FamilyShell>`.
6. Añadir `requireRole` a `utils/supabase/auth.ts` y aplicar en cada Server Component de los dos grupos.
7. Modificar `app/login/actions.ts` (`signIn`) para redirigir por rol respetando `?next=`.
8. Verificar `npm run lint` y `npm run build`; probar con Playwright que staff ve `/` y `/kids`, que familia ve `/familiar`, y que los redirects cruzados funcionan.

## Open Questions

- (Ninguna. Las decisiones quedan cerradas en este design; el siguiente cambio podrá traer el contenido diferenciado.)