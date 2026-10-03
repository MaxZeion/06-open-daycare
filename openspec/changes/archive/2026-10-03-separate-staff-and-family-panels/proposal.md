# Proposal

## Why

Hoy staff y familia entran al mismo árbol de rutas con el mismo shell (`/`, `/kids`, sidebar único con `NewPostButton` siempre visible). Las maquetas (`pantallas/familia-*.dc.html`, `pantallas/feed.dc.html`) ya dibujan dos productos visualmente distintos — navegación, color de avatar, CTA global — pero el código los trata como uno. Falta el reflejo técnico: rutas por audiencia, layouts separados y guard de rol en cada entrada. La tabla `users.role` y los claims del JWT (`role`, `daycare_id`) ya están disponibles desde SPEC 09/10; el login real y la activación de padres ya están resueltos en SPEC 10/12. Es el momento de sentar la separación física antes de que llegue el primer contenido específico de familia (filtrado de feed por `post_children`, "Resumen del día" real).

## What Changes

- **Route groups** `app/(staff)/` y `app/(family)/` con layouts y shells separados.
- **`/`** pasa a ser exclusiva de staff (`app/(staff)/page.tsx`). Los archivos actuales `app/page.tsx`, `app/feed/`, `app/kids/` se mueven a `app/(staff)/`.
- **`/familiar`** nueva ruta para familia (`app/(family)/page.tsx`), montando el mismo `FeedPageClient` con mocks compartidos.
- **Guards por rol** en cada Server Component de los dos grupos: parent que entra a una ruta de staff → `redirect('/familiar')`; staff que entra a `/familiar` → `redirect('/')`. Helper nuevo `requireRole(role, next?)` en `utils/supabase/auth.ts`.
- **Sidebar por rol** (`StaffSidebar`, `FamilySidebar`). Diferencias: subtítulo ("Sala Soles" vs "Familia"), color de avatar (terracota vs lavanda), navegación (Feed/Niños/Avisos···/Mi cuenta··· vs Feed/Resumen del día···/Mi cuenta···).
- **`NewPostButton`** solo en `StaffSidebar`; `FamilySidebar` no lo monta. El `FeedProvider` queda en el layout del feed de staff; el feed de familia se renderiza sin provider de creación.
- **Login redirige por rol**: tras `signInWithPassword` OK, `signIn` resuelve destino según `claims.app_metadata.role` (staff → `/`, family → `/familiar`) respetando `?next=` si es coherente con el rol.
- **`signOut` compartido** entre ambos shells (sin cambios de comportamiento).
- **`npm run lint` y `npm run build` siguen verdes**.

**No breaking** para usuarios autenticados (el staff sigue viendo el mismo feed; los padres no podían acceder antes — el SPEC 12 los acaba de crear y su flujo de activación los lleva por `/`, que ahora será `/familiar`).

## Capabilities

### New Capabilities

- `staff-panel`: comportamiento del panel de personal — ruta `/` (feed), `/kids` y `/kids/[id]`, shell con `StaffSidebar` (NewPostButton, Niños, Avisos, Mi cuenta), guard `requireRole('staff', '/familiar')` en cada Server Component.
- `family-panel`: comportamiento del panel de familia — ruta `/familiar`, shell con `FamilySidebar` (Resumen del día, Mi cuenta — sin NewPostButton), guard `requireRole('family', '/')` en cada Server Component, login redirige a `/familiar`.

### Modified Capabilities

- (Ninguna. No hay capabilities OpenSpec previas en el proyecto; los `specs/NN-*.md` del proyecto son la convención local anterior y este change adopta OpenSpec.)

## Impact

**Archivos a mover** (de `app/` a `app/(staff)/`):
- `app/page.tsx` → `app/(staff)/page.tsx`
- `app/feed/FeedPageClient.tsx` → `app/(staff)/_components/feed/FeedPageClient.tsx`
- `app/kids/**` → `app/(staff)/kids/**`

**Archivos a mover** (de `components/` a `app/(staff)/_components/`):
- `components/feed/**` (PostCard, FeedContext, NewPostModal, mockPosts) → `app/(staff)/_components/feed/**`
- `components/kids/**` (AddKidModal, AllergyBox, InfoRow, KidCard, LinkParentModal, ParentRow, RoomTabs, dateMask, mapKid, mockKids) → `app/(staff)/_components/kids/**`
- `components/shared/NewPostButton.tsx` → usado solo por staff; queda accesible desde `app/(staff)/_components/` o `components/shared/` con guard de rol interno.

**Archivos a dividir** (en `components/shared/`):
- `components/shared/AppShell.tsx` → renombrar a `StaffShell.tsx`.
- `components/shared/AppShellClient.tsx` → renombrar a `StaffShellClient.tsx`.
- `components/shared/Sidebar.tsx` → renombrar a `StaffSidebar.tsx`.
- Nuevo `FamilyShell.tsx` + `FamilyShellClient.tsx` + `FamilySidebar.tsx`.

**Archivos a crear**:
- `app/(staff)/layout.tsx` → monta `StaffShell`.
- `app/(family)/layout.tsx` → monta `FamilyShell`.
- `app/(family)/page.tsx` → Server Component con guard `requireRole('family', '/')`, monta `<FeedPageClient />` dentro de `FamilyShell`.
- `utils/supabase/auth.ts` → añade `requireRole(role, next?)` reusando `getCurrentUser`.
- `app/login/actions.ts` → modifica `signIn` para redirigir por rol.

**Archivos a tocar (sin mover)**:
- `app/layout.tsx` (root) → sin cambios estructurales; sigue siendo `<html>/<body>` + `globals.css`.
- `app/login/page.tsx`, `app/login/LoginForm.tsx` → sin cambios.
- `app/activate/**` → sin cambios (la activación sigue llevando al login, que ahora redirige por rol).
- `app/_actions/auth.ts` (`signOut`) → sin cambios.
- `proxy.ts` → sin cambios (ya refresca sesión).
- `supabase/migrations/**` → sin cambios.
- `types/supabase.ts` → sin cambios.

**Riesgo de imports relativos rotos** por el movimiento de archivos: SPECs 01, 02, 05, 07, 11, 12 importan desde `../components/feed/...`, `../components/kids/...`, `../components/shared/...`, `@/components/feed/...`, etc. El refactor debe ajustar esos imports (o mover archivos de forma atómica verificando `npm run build` al final).

**Sin impacto** en DB: no se crean/modifican tablas ni policies en este change. El endurecimiento de RLS multi-tenant (claims `daycare_id`/`role` en policies) sigue diferido a un cambio posterior con el filtrado real del feed.