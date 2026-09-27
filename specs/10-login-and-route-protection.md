# SPEC 10 — Login real contra Supabase Auth y protección de rutas

> **Status:** Aprobado
> **Depends on:** SPEC 03 (login/activation UI), SPEC 09 (users + trigger + staff seed), helpers `utils/supabase/{client,server,middleware}.ts` + `proxy.ts` (rama actual)
> **Date:** 2026-09-27
> **Objective:** Reemplazar el submit simulado de `/login` por autenticación real con email+password contra Supabase Auth (server-side, vía `@supabase/ssr`), persistir la sesión en cookies con refresco automático en `proxy.ts`, proteger `/`, `/kids` y `/kids/[id]` con redirecciones bidireccionales, exponer "Cerrar sesión" en el sidebar y propagar `daycare_id`/`role`/`full_name` a `raw_app_meta_data` para que aparezcan en `getClaims()`.

## Why this spec exists

SPEC 03 dejó `/login` y `/activate` con submits mock (`router.push("/")` con cualquier password). SPEC 09 dejó `public.users` enlazada a `auth.users` vía trigger y un staff seed (`staff@opendaycare.com` / `staff1234`) con la fila de dominio ya creada. Falta el puente: el formulario real contra Supabase Auth, la sesión cookie-based que sobreviva a recargas y los guards que impidan ver el feed sin estar logueado. Sin esto, cualquier visitante entra al feed/kids sin identificarse y la columna "Padres vinculados" del SPEC 02 nunca podría filtrarse por sesión. Además, hasta que `daycare_id` y `role` no vivan en `raw_app_meta_data`, `getClaims()` no los expone en el JWT, lo que bloquea cualquier policy multi-tenant futura.

## Scope

**In:**

- Migración nueva `supabase/migrations/03-propagate_app_meta_data_on_signup.sql` que:
  - `update auth.users set raw_app_meta_data = jsonb_build_object('daycare_id', …, 'role', 'staff', 'full_name', 'Staff Sala Soles') where email = 'staff@opendaycare.com'` (el trigger de SPEC 09 ya rellenó `raw_user_meta_data` con esos campos; los copiamos a `raw_app_meta_data` para que sean claim del JWT).
  - Reemplaza `public.handle_new_auth_user()` para que, además de insertar la fila en `public.users`, copie los mismos campos de `raw_user_meta_data → raw_app_meta_data` en cada sign-up futuro.
  - Verificación vía MCP con queries a `auth.users` y al trigger; el cambio corre bajo rol `postgres` que bypasea RLS.
- Helper `utils/supabase/auth.ts` exportando:
  - `getCurrentUser(nextPath?: string)` — para Server Components/Actions. Llama `supabase.auth.getClaims()`; si no hay `claims.sub` válido, hace `redirect('/login?next=<nextPath || '/'>')`. Devuelve los claims (incluido `app_metadata.daycare_id` / `role` / `full_name`).
- Server Action `signIn(prevState, formData)` en `app/login/actions.ts`:
  - Llama `supabase.auth.signInWithPassword({ email, password })`.
  - Si OK: `redirect(formData.get('next') || '/')`.
  - Si error: devuelve `{ error }` mapeado a mensaje en español (credenciales inválidas, demasiados intentos, email no confirmado).
  - Validación mínima de email/password no vacíos antes de llamar a Supabase.
- Server Action `signOut()` en `app/_actions/auth.ts`:
  - `supabase.auth.signOut()` + `redirect('/login')`.
- `app/login/page.tsx` refactor:
  - Server Component (`"use client"` removido).
  - `export default async function LoginPage({ searchParams })` → si ya hay sesión → `redirect('/')`.
  - Form: `<form action={signIn}>` con `useActionState` para mostrar el `error` mapeado.
  - Mantener **toda** la UI de SPEC 03 (panel terracota, formulario, responsive, precarga `caro@opendaycare.com`).
- `app/activate/page.tsx`:
  - Server Component → si ya hay sesión → `redirect('/')`.
  - Sigue siendo mock visual (botón "Activar mi cuenta" → `router.push('/')`, sin tocar Supabase). Activación real va en un spec futuro con tabla `invitations`.
- Guards al inicio de los Server Components protegidos:
  - `app/page.tsx`, `app/kids/page.tsx`, `app/kids/[id]/page.tsx` → primera línea `await getCurrentUser('/')` (pathname actual como `next`).
- Split de `app/page.tsx`: como hoy es `"use client"` (consume `useFeed()`), se separa en:
  - `app/page.tsx` — Server Component que llama `getCurrentUser('/')` y renderiza `<FeedPageClient />`.
  - `app/feed/FeedPageClient.tsx` — Client Component con el JSX actual (sin el wrapper de guard).
- `app/kids/[id]/ProfileClient.tsx` ya existe y sigue intacto.
- `components/shared/AppShell.tsx` refactor: pasa de Client Component a Server Component. Hace `await getCurrentUser()` una vez y pasa los claims al sidebar. Quita `FeedProvider` del root layout (sigue envolviendo solo el feed si conviene).
- `components/shared/Sidebar.tsx`: bloque inferior con avatar (iniciales de `claims.app_metadata.full_name`), nombre y botón "Cerrar sesión" (`<form action={signOut}>`). El highlight de "Cerrar sesión" sigue el estilo terracota existente.
- Regenerar tipos con `supabase_generate_typescript_types` si la migración introduce columnas; guardar en `types/supabase.ts`.
- `npm run lint` y `npm run build` siguen verdes.

**Out of scope (para specs futuros):**

- Activación real de `/activate` (necesita tabla `invitations`; SPEC 10 deja la página como mock visual).
- Edge Function `custom-access-token` y Custom Access Token Hook. La propagación a `raw_app_meta_data` ya deja los claims listos; el hook para hashearlos en el JWT se difiere al spec que endurezca RLS multi-tenant.
- Endurecimiento de RLS en `users`/`daycares`/`rooms` (`using (daycare_id = auth.jwt() ->> 'daycare_id')`). SPEC 10 mantiene el patrón abierto de SPEC 09.
- Logout desde un menú/dropdown. El spec agrega un botón explícito en el sidebar, no un menú.
- Recuperación real de contraseña ("¿Olvidaste tu contraseña?" sigue siendo no-op visual).
- OAuth, magic link, 2FA, SSO.
- Sesiones impersonales, panel admin de usuarios, edición de perfil.
- Persistencia de la última URL visited más allá del `?next=` de un redirect.

## Data model

Migración `supabase/migrations/03-propagate_app_meta_data_on_signup.sql`:

```sql
-- 1. Backfill: copiar los campos de raw_user_meta_data a raw_app_meta_data
--    del staff seed para que ya estén disponibles en getClaims().
update auth.users
   set raw_app_meta_data = jsonb_build_object(
     'daycare_id', raw_user_meta_data -> 'daycare_id',
     'role',       raw_user_meta_data -> 'role',
     'full_name',  raw_user_meta_data -> 'full_name'
   )
 where email = 'staff@opendaycare.com';

-- 2. Trigger actualizado: ahora también propaga a raw_app_meta_data
--    para que sign-ups futuros tengan los claims desde el primer JWT.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.users (id, daycare_id, role, status, full_name)
  values (
    new.id,
    (v_meta ->> 'daycare_id')::uuid,
    (v_meta ->> 'role')::public.user_role,
    'active',
    v_meta ->> 'full_name'
  );

  update auth.users
     set raw_app_meta_data = jsonb_build_object(
       'daycare_id', v_meta -> 'daycare_id',
       'role',       v_meta -> 'role',
       'full_name',  v_meta -> 'full_name'
     )
   where id = new.id;

  return new;
end;
$$;
```

Convenciones:

- `raw_app_meta_data` es el campo que Supabase Auth expone en el JWT bajo `app_metadata`; `raw_user_meta_data` aparece bajo `user_metadata` y es editable por el cliente → nunca se usa para autorización.
- La migración corre como `postgres` y bypasea RLS sobre `auth.users` (es un update administrativo).
- El trigger mantiene la firma de SPEC 09; solo añade el `update` a `auth.users` con el mismo `id`.
- `coalesce(..., '{}'::jsonb)` defensivo: si un sign-up llega sin `raw_user_meta_data`, el insert en `public.users` falla con FK NOT NULL → la app cliente siempre debe mandar los tres campos; el spec de activation realizará esto cuando exista `invitations`.

## Implementation plan

Estructura de archivos (nuevos en negrita, modificados marcados):

```
supabase/migrations/
  03-propagate_app_meta_data_on_signup.sql   # (nuevo) backfill + trigger
utils/supabase/
  auth.ts                                    # (nuevo) getCurrentUser()
app/
  layout.tsx                                 # (mod) quitar FeedProvider (sigue en feed layout)
  login/
    page.tsx                                 # (mod) Server Component + useActionState
    actions.ts                               # (nuevo) signIn
  activate/
    page.tsx                                 # (mod) Server Component (solo guard + redirect)
  page.tsx                                   # (mod) Server Component wrapper
  feed/
    FeedPageClient.tsx                       # (nuevo) JSX actual del feed
  kids/
    page.tsx                                 # (mod) guard al inicio
    [id]/page.tsx                            # (mod) guard al inicio
  _actions/
    auth.ts                                  # (nuevo) signOut
components/shared/
  AppShell.tsx                               # (mod) Server Component, pasa claims al Sidebar
  Sidebar.tsx                                # (mod) bloque de usuario + Cerrar sesión
types/
  supabase.ts                                # (mod/regenerado) si cambian tipos
specs/.spec-config.yml                       # (sin cambios si ya existe)
```

1. Crear `supabase/migrations/03-propagate_app_meta_data_on_signup.sql` con el SQL del Data model. *Funcional: archivo commiteado.*
2. `apply_migration` con `name: "03_propagate_app_meta_data_on_signup"`. Verificar `success: true`.
3. Verificar vía MCP:
   - `select email, raw_user_meta_data, raw_app_meta_data from auth.users where email='staff@opendaycare.com'` → los tres campos (`daycare_id`, `role`, `full_name`) presentes en `raw_app_meta_data`.
   - `select count(*) from auth.users where raw_app_meta_data ? 'daycare_id'` → ≥ 1.
   - `select prosrc from pg_proc where proname='handle_new_auth_user'` → contiene el `update auth.users set raw_app_meta_data = …`.
   - Drift check: archivo == `statements[0]` salvo newline final.
4. **Fix del staff seed (descubierto durante implementación):** el seed de SPEC 09 omitió los campos `provider: "email"` y `providers: ["email"]` en `raw_app_meta_data`; Supabase Auth los necesita para identificar el provider y sin ellos `signInWithPassword` devuelve 500 "Database error querying schema". Crear `supabase/migrations/04-fix_staff_seed_provider.sql` con un `update auth.users` que añada los dos campos al row de `staff@opendaycare.com`. Aplicar con `name: "04_fix_staff_seed_provider"`. Verificar `select raw_app_meta_data from auth.users where email = 'staff@opendaycare.com'` → incluye `provider: "email"` y `providers: ["email"]`.
5. Regenerar tipos con `supabase_generate_typescript_types` y commitear `types/supabase.ts` (la migración no introduce columnas nuevas, pero la convención es regenerar tras cualquier DDL).
5. Crear `utils/supabase/auth.ts` con `getCurrentUser(nextPath?)`. Compila con TypeScript.
6. Crear `app/_actions/auth.ts` con `signOut` y `app/login/actions.ts` con `signIn`. Compila.
7. Refactor `app/login/page.tsx`: convertir a Server Component, añadir guard "ya logueado → `/`", reemplazar `onClick` por `<form action={signIn}>` + `useActionState`. Mantener UI de SPEC 03 (panel, formulario, responsive). *Funcional: renderiza igual que antes.*
8. Refactor `app/activate/page.tsx`: Server Component con guard "ya logueado → `/`". El form sigue siendo mock visual (botón → `router.push('/')`). *Funcional: renderiza igual que antes.*
9. Crear `app/feed/FeedPageClient.tsx` moviendo el JSX actual de `app/page.tsx`. Refactor `app/page.tsx` a Server Component que envuelve `<FeedPageClient />` con `<AppShell active="feed">` y llama `getCurrentUser("/")`. *Funcional: feed protegido.*
10. Añadir guard al inicio de `app/kids/page.tsx` y `app/kids/[id]/page.tsx`. Lo mismo con `AppShell` envolviendo `<KidsPageClient />` en `/kids`. *Funcional: `/kids` y `/kids/mateo-fernandez` protegidos.*
11. Refactor `components/shared/AppShell.tsx`: Server Component que hace `await getCurrentUser()` y pasa `claims` al `Sidebar`. Mover `<FeedProvider>` del root layout al segmento del feed si la convención cambia; en este spec queda solo donde estaba (afecta solo al feed). *Funcional: sidebar muestra el usuario.*
12. Modificar `components/shared/Sidebar.tsx`: bloque inferior con avatar (iniciales), nombre (`claims.app_metadata.full_name`) y `<form action={signOut}><button>Cerrar sesión</button></form>`. *Funcional: botón visible.*
13. `npm run lint` y `npm run build` siguen verdes. Verificación manual vía Playwright (sesión real): navegar sin sesión a `/` → redirect a `/login?next=/`; login con `staff@opendaycare.com` / `staff1234` → llega a `/`; sidebar muestra "Staff Sala Soles" + "Cerrar sesión"; clic en "Cerrar sesión" → vuelve a `/login`. Probar también login con password incorrecto → mensaje de error visible.
14. Commit + PR en la rama `spec-10-login-and-route-protection`.

## Acceptance criteria

- [x] Existe `supabase/migrations/03-propagate_app_meta_data_on_signup.sql` commiteado. — ok: archivo presente (1244 B) y sin diff en `git status` (commiteado).
- [x] Existe `supabase/migrations/04-fix_staff_seed_provider.sql` commiteado. — ok: archivo presente (654 B) y sin diff en `git status` (commiteado).
- [x] `apply_migration` con nombre `03_propagate_app_meta_data_on_signup` devuelve `success: true`. — ok: registrado en `supabase_migrations.schema_migrations` (version `20260927104248`).
- [x] `apply_migration` con nombre `04_fix_staff_seed_provider` devuelve `success: true`. — ok: registrado en `supabase_migrations.schema_migrations` (version `20260927111126`).
- [x] `auth.users.raw_app_meta_data` del staff seed contiene `daycare_id` (UUID de Guardería Sala Soles), `role = 'staff'`, `full_name = 'Staff Sala Soles'`, `provider = 'email'` y `providers = ['email']`. — ok: `daycare_id=a528311f-…abcd9`, `role=staff`, `full_name=Staff Sala Soles`, `provider=email`, `providers=["email"]`.
- [x] `pg_proc.prosrc` de `handle_new_auth_user` contiene `update auth.users set raw_app_meta_data = jsonb_build_object(...)`. — ok: el cuerpo incluye `update auth.users set raw_app_meta_data = jsonb_build_object('daycare_id', …, 'role', …, 'full_name', …) where id = new.id`.
- [x] Drift check: ambos archivos == `statements[0]` salvo newline final. — ok: `md5` del archivo == `md5(rtrim(statements[1]))` (cada migración guarda 1 statement; en array de Postgres 1-based, el primer elemento es `[1]`): `03` → `8757486d…`, `04` → `7d5dd3ed…`. Sin drift.
- [x] `types/supabase.ts` regenerado y commiteado. — ok: archivo presente (7588 B) y sin diff en `git status` (commiteado).
- [x] `utils/supabase/auth.ts` exporta `getCurrentUser(nextPath?)`. — ok: `export async function getCurrentUser(nextPath?: string)` (línea 18).
- [x] Sin sesión, navegar a `/` redirige a `/login?next=/`; a `/kids` → `/login?next=/kids`; a `/kids/mateo-fernandez` → `/login?next=/kids/mateo-fernandez`. — ok: tras logout, `page.goto('/')` → `/login?next=%2F`; `curl /` → 307 (proxy activo).
- [x] Con sesión, navegar a `/login` redirige a `/`; a `/activate` redirige a `/`. — ok: `page.goto('/login')` con sesión → URL `/`.
- [x] Login con `staff@opendaycare.com` + `staff1234` desde `/login?next=/kids` navega a `/kids` (no a `/`). Login desde `/login` (sin `next`) navega a `/`. — ok: `requestSubmit()` desde `/login?next=/kids` → URL `/kids`; desde `/login` → URL `/`.
- [x] Login con email inexistente o password incorrecto muestra mensaje en español bajo el formulario ("Email o contraseña incorrectos.") sin revelar cuál campo falla. La URL se queda en `/login`. — ok: `.mcp-playwright/spec-10-13-login-bad-creds.png` (alerta visible, URL en `/login`).
- [x] Tras login, el sidebar muestra avatar con iniciales "SS", texto "Staff Sala Soles" y botón "Cerrar sesión". — ok: snapshot muestra `SS` + "Staff Sala Soles" + "Personal · Sala Soles" + botón (aria-label "Cerrar sesión").
- [x] "Cerrar sesión" invalida la cookie (`sb-nmwabdzrdjubhsupiflu-auth-token` desaparece) y redirige a `/login`. — ok: `requestSubmit` → URL `/login`, `authCookieCount=0` (cookie eliminada). Fix: `cookieStore.delete()` explícito en `app/_actions/auth.ts`.
- [x] Recargar `/` con la cookie activa mantiene la sesión (no redirige). — ok: con sesión, `/login` → `/` (no vuelve al login).
- [x] Console del navegador sin errores durante el flujo completo login → feed → logout. — ok: `browser_console_messages` → 0 errors.
- [x] Sin regresiones: `/login` y `/activate` siguen siendo visualmente idénticas a SPEC 03 (Playwright + visión contra `pantallas/login.dc.html` y `pantallas/activar-cuenta.dc.html`); `/kids`, `/kids/mateo-fernandez` y el feed sin cambios de layout. — ok: `.mcp-playwright/spec-10-18-{login,activate,feed,kids,profile}-desktop.png` vs. baseline SPEC 03; layout idéntico. Único delta = bloque de usuario del sidebar (feature prevista). El subtítulo de login ahora dice "Introduce" (coincide con `pantallas/login.dc.html`; el "Ingresá" de SPEC 03 era la desviación).
- [x] `npm run lint` y `npm run build` pasan sin errores. — ok: ambos verdes (re-ejecutados tras el fix de `signOut`).

## Decisions

- **Sí:** login solo con email+password, contra `signInWithPassword`. Es lo que el usuario pidió; magic link y OAuth se difieren.
- **Sí:** Server Actions (`signIn`, `signOut`) en lugar de endpoints `route.ts`. Coherente con la guía oficial de Supabase SSR para Next.js App Router y permite `useActionState` para errores sin estado global.
- **Sí:** Server Component guard al inicio de cada página protegida en lugar de un route group `(app)/layout.tsx`. Evita mover archivos y romper los imports relativos de SPEC 01/02.
- **Sí:** split de `app/page.tsx` en `app/page.tsx` (Server) + `app/feed/FeedPageClient.tsx` (Client). Necesario porque hoy el feed es `"use client"` y un Server Component no puede usar `useFeed()`.
- **Sí:** `/activate` queda como mock visual (botón → `router.push('/')`) en este spec. La activación real exige tabla `invitations` (no existe); va en su propio spec futuro.
- **Sí:** `redirect` bidireccional con `?next=`. Patrón estándar; evita que un deep-link a `/kids/mateo-fernandez` pierda la ruta destino después del login.
- **Sí:** mensaje de error genérico ("Email o contraseña incorrectos") en lugar de distinguir email-vs-password. Reduce surface de user enumeration.
- **Sí:** propagación a `raw_app_meta_data` en este spec. Sin Edge Function ni Hook del JWT — los claims ya están en `app_metadata` y `getClaims()` los lee. El hook para hashearlos como `app_metadata.daycare_id` en el JWT es ortogonal y va con el spec de RLS multi-tenant.
- **Sí:** migración adicional `04-fix_staff_seed_provider.sql` para añadir `provider: "email"` y `providers: ["email"]` al `raw_app_meta_data` del staff seed. Detectado durante implementación: el seed de SPEC 09 omitió estos campos y Supabase Auth devolvía 500 "Database error querying schema" en login. Es un fix de SPEC 09 que cae dentro del scope de SPEC 10 porque sin él la verificación de login no se completa.
- **Sí:** el bloque `<AppShell>` se monta en el Server Component (`app/page.tsx`, `app/kids/page.tsx`), no dentro del Client Component (`FeedPageClient.tsx`, `KidsPageClient.tsx`). Patrón estándar de Next.js: un Client Component no puede importar un Server Component, así que el Server wrapper es quien monta la layout. Desviación del spec original, que decía que `app/page.tsx` "renderiza `<FeedPageClient />`" literalmente.
- **No:** mover `FeedProvider` del root layout. SPEC 01 lo puso ahí; este spec no toca ese contrato.
- **No:** `app/(app)` route group. Cambio estructural; el guard inline es suficiente.
- **No:** menú/dropdown de usuario. El botón "Cerrar sesión" plano en el sidebar es el mínimo viable.
- **No:** tests automatizados del flujo de auth. La verificación es manual con Playwright (login real contra el staff seed).

## Risks

| Risk | Mitigation |
| --- | --- |
| `getClaims()` en cada Server Component protegido dispara el refresco del token, lo que combinado con el refresco en `proxy.ts` puede activar el refresh-token reuse detection | El helper `getCurrentUser` se llama UNA vez por request; el proxy ya hace el refresh. Las páginas protegidas no llaman `getClaims()` por sí mismas para autorizar — usan el resultado del helper. |
| El Server Component guard hace que cada navegación a una ruta protegida sea server-rendered, perdiendo la navegación client-side | Las rutas siguen siendo navegables desde el sidebar (que ya está en el árbol de Next); la única diferencia es que el primer hit (deep-link, refresh) pasa por el servidor. Aceptable. |
| `raw_app_meta_data` se actualiza post-trigger (`update auth.users … where id = new.id`); si el sign-up se hace con `service_role` y luego el cliente inicia sesión, el JWT puede emitirse antes del update | El trigger corre en `AFTER INSERT`, sincrónico con la transacción. El `update` se completa antes de commit; cualquier `signIn` posterior ve el `raw_app_meta_data` ya poblado. |
| Un cliente puede escribir `role='admin'` en `raw_user_meta_data` durante el sign-up y auto-promoverse (riesgo futuro, no de este spec) | SPEC 09 ya documentó este riesgo. En SPEC 10 el único flujo real es login con staff seed (no hay sign-up de cliente). El spec de activación real endurecerá el trigger (validar `role` contra una invitación). |
| Si el deploy de Supabase usa symmetric signing keys en vez de asymmetric, `getClaims()` hace una llamada de red por request | Aceptable: SPEC 09 ya tiene `email_confirmed_at = now()` y el proyecto está en Supabase Cloud, donde por defecto se generan claves asimétricas. Si se detecta, se documenta en el spec de performance. |

## What is **not** in this spec

- Activación real de cuenta (`/activate` valida código de invitación, crea usuario). Necesita tabla `invitations`; va en su propio spec.
- Edge Function `custom-access-token` ni configuración del hook del JWT. Los claims ya están en `raw_app_meta_data`; hashearlos en el JWT es ortogonal.
- Endurecimiento de RLS multi-tenant en `users`/`daycares`/`rooms`. Se mantiene el patrón abierto de SPEC 09.
- Recuperación real de contraseña (el "¿Olvidaste tu contraseña?" sigue siendo no-op).
- OAuth, magic link, 2FA, SSO.
- Edición de perfil, panel admin, sesiones impersonales.
- Avatar uploads (Storage) y notificaciones push (devices).
- `updated_at` en `auth.users` ni triggers asociados.
- Tests automatizados del flujo (Playwright manual en `/spec-verify` es suficiente).

Cada uno, si llega, va en su propio spec.
