# SPEC 09 — Tabla `users`, enums, trigger de auth y usuario staff seed

> **Status:** Aprovado
> **Depends on:** SPEC 08 (`daycares`, `rooms` con seed "Guardería Sala Soles")
> **Date:** 2026-09-26
> **Objective:** Crear la tabla `users` con los enums `user_role` y `user_status`, sincronizada con `auth.users` vía trigger SECURITY DEFINER, RLS con patrón abierto `select` para `authenticated` (mismo enfoque que SPEC 08, endurecimiento multi-tenant para el spec de auth), y un usuario staff seed para pruebas.

## Why this spec exists

Siguiente tabla de la cadena de dependencias del docs (`../07-DB-Schema`): `users` depende de `daycares` (FK) y de `auth.users` (PK + FK ON DELETE CASCADE). Es la primera tabla que se cruza con Supabase Auth, lo que obliga a definir desde ya el patrón de sincronización `auth.users → public.users` mediante un trigger. Sin esto, los specs futuros de login/activación real no pueden aterrizar: no habría forma de tener la fila de dominio creada automáticamente al registrarse.

El endurecimiento multi-tenant estricto (con claims `daycare_id` y `role` en el JWT vía Custom Access Token Hook) se difiere al spec que aterrice auth real, cuando ya tenga sentido sembrar el hook. Mientras tanto, RLS sigue el patrón abierto de SPEC 08: `select` para `authenticated`, sin policies de escritura. Es la misma decisión de "compatibilidad con multi-tenant futuro" que se tomó para `daycares`/`rooms`.

## Scope

**In:**

- Archivo `supabase/migrations/02-create_users_enums_and_auth_trigger.sql` con:
  - `create extension if not exists pgcrypto schema extensions;` (defensivo).
  - Enums: `user_role` (`staff` / `parent` / `admin`) y `user_status` (`pending` / `active`).
  - Tabla `public.users` con todas las columnas del docs: `id` (PK + FK → `auth.users(id)` ON DELETE CASCADE), `daycare_id` (FK → `daycares` ON DELETE RESTRICT), `role`, `status` (default `active`), `full_name`, `avatar_url` (nullable), `notify_on_post` (default `true`), `daily_summary_enabled` (default `true`), `created_at`.
  - Índices: `users_daycare_id_idx` (multi-tenant), `users_role_idx` (filtrado por rol, futuro).
  - RLS habilitado.
  - Policy `users_select_authenticated` para `authenticated`: `using (true)` (mismo patrón que SPEC 08 para `daycares`/`rooms`).
  - Función `public.handle_new_auth_user()` (SECURITY DEFINER, `search_path = public, auth`) que en `AFTER INSERT ON auth.users` lee `daycare_id`, `role`, `full_name` desde `new.raw_user_meta_data` e inserta la fila en `public.users`.
  - Trigger `on_auth_user_created` AFTER INSERT ON auth.users FOR EACH ROW.
  - Seed: insert directo en `auth.users` para `staff@opendaycare.com` (password `staff1234` hasheada con `crypt()` + `gen_salt('bf')`, `raw_user_meta_data` con `daycare_id` apuntando a Guardería Sala Soles, `role: 'staff'`, `full_name: 'Staff Sala Soles'`). El trigger crea la fila en `public.users`.
- Verificación desde el MCP (queries de lectura; los INSERTs iniciales corren bajo rol postgres que bypasea RLS).
- Drift check: archivo del repo == `statements[0]` salvo newline final.
- `npm run lint` y `npm run build` siguen verdes (no se toca código de la app).

**Out of scope (para specs futuros):**

- Edge Function `custom-access-token` (Custom Access Token Hook).
- Configuración del hook en Supabase Dashboard.
- Propagación de `raw_user_meta_data` a `raw_app_meta_data` dentro del trigger (lo necesita el hook, va con el spec de auth).
- RLS multi-tenant estricto (`using (daycare_id = (auth.jwt() ->> 'daycare_id')::uuid)`). Va con el spec de auth, que es cuando el JWT ya lleva esos claims.
- Endurecimiento de RLS en `daycares`/`rooms` (queda con el patrón abierto; el switch futuro es de 1 línea).
- `updated_at` y trigger `set_updated_at` (decidido no incluir, coherente con SPEC 08).
- Demás enums y tablas del docs (`children`, `parent_children`, `invitations`, `posts`, etc.).
- Auth real, sign-up/sign-in funcional, magic link, OAuth — las páginas `/login` y `/activate` actuales son mocks sin backend.
- Policies de `insert/update/delete` en `users`. Escritura solo vía migraciones o `service_role`.
- Avatar uploads (Storage).
- UI de gestión de usuarios.
- Tests automatizados (pgTAP, scripts reutilizables).

## Data model

```sql
-- supabase/migrations/02-create_users_enums_and_auth_trigger.sql

create extension if not exists pgcrypto schema extensions;

-- Enums
create type public.user_role  as enum ('staff', 'parent', 'admin');
create type public.user_status as enum ('pending', 'active');

-- Tabla
create table public.users (
  id                     uuid primary key references auth.users(id) on delete cascade,
  daycare_id             uuid not null references public.daycares(id) on delete restrict,
  role                   public.user_role  not null,
  status                 public.user_status not null default 'active',
  full_name              text not null,
  avatar_url             text,
  notify_on_post         boolean not null default true,
  daily_summary_enabled  boolean not null default true,
  created_at             timestamptz not null default now()
);

create index users_daycare_id_idx on public.users(daycare_id);
create index users_role_idx       on public.users(role);

alter table public.users enable row level security;

-- Policy (patrón abierto, endurecimiento multi-tenant en el spec de auth)
create policy "users_select_authenticated"
  on public.users for select
  to authenticated
  using (true);

-- Trigger function: crea la fila de dominio desde raw_user_meta_data
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_daycare_id uuid             := (new.raw_user_meta_data ->> 'daycare_id')::uuid;
  v_role       public.user_role := (new.raw_user_meta_data ->> 'role')::public.user_role;
  v_full_name  text             := new.raw_user_meta_data ->> 'full_name';
begin
  insert into public.users (id, daycare_id, role, status, full_name)
  values (new.id, v_daycare_id, v_role, 'active', v_full_name);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Seed staff user (la migración corre con rol postgres que bypasea RLS)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, raw_app_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'staff@opendaycare.com',
  crypt('staff1234', gen_salt('bf')),
  now(),
  jsonb_build_object(
    'daycare_id', (select id from public.daycares where name = 'Guardería Sala Soles'),
    'role',       'staff',
    'full_name',  'Staff Sala Soles'
  ),
  '{}'::jsonb,
  now(),
  now()
);
```

Convenciones:

- PK `id uuid references auth.users(id) on delete cascade`: si se borra el usuario en `auth.users` (vía admin), la fila de dominio desaparece con él.
- `daycare_id ... on delete restrict`: no permitimos borrar una guardería con usuarios asignados (forzaría decisión humana).
- `status default 'active'`: el docs lo justifica con "el estado previo al signup se modela en `invitations`".
- `gen_random_uuid()` viene de `extensions.pgcrypto` (defensivo arriba).
- `encrypted_password = crypt('staff1234', gen_salt('bf'))` usa el mismo esquema bcrypt que Supabase Auth internamente.
- El trigger solo crea la fila en `public.users`; no propaga a `raw_app_meta_data` (lo hará el spec de auth cuando llegue el hook del JWT).
- `instance_id = '00000000-0000-0000-0000-000000000000'` es la "default instance" de Supabase.
- `email_confirmed_at = now()` evita el flujo de confirmación; el staff puede loguearse inmediatamente cuando llegue auth.

## Implementation plan

1. Crear `supabase/migrations/02-create_users_enums_and_auth_trigger.sql` con el SQL del Data model.
2. Aplicar con el MCP: `apply_migration` con `name: "02_create_users_enums_and_auth_trigger"` y `query` = contenido del archivo. Verificar `success: true`.
3. Verificar desde el MCP:
   - `list_tables` muestra `public.users` con todas las columnas y FKs (`users_daycare_id_fkey`, `users_id_fkey`).
   - `select n.nspname, t.typname, t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname in ('user_role','user_status')` → 2 filas en `public`.
   - `select relname, relrowsecurity from pg_class where relname = 'users'` → `relrowsecurity = true`.
   - `select polname, polcmd from pg_policy where polrelid = 'public.users'::regclass` → exactamente 1 fila (`users_select_authenticated`, cmd `r`). Cero `i/u/d`.
   - `select indexname from pg_indexes where schemaname='public' and tablename='users'` → `users_daycare_id_idx`, `users_role_idx`, y el PK implícito.
   - `select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'` → 1 fila.
   - `select count(*) from public.users` → 1.
   - `select count(*) from auth.users where email = 'staff@opendaycare.com'` → 1.
   - La fila de `public.users` tiene `role='staff'`, `status='active'`, `daycare_id` apuntando al id de Guardería Sala Soles, `full_name='Staff Sala Soles'`, `avatar_url is null`, `notify_on_post=true`, `daily_summary_enabled=true`.
4. Probar el trigger insertando un segundo `auth.users` vía `execute_sql` con `raw_user_meta_data` válido (otro `role='parent'`, otro `daycare_id` = el mismo, `full_name` inventado). Verificar que `public.users` tiene 2 filas con los datos correctos. Borrar ambas filas (auth + public) después para dejar solo el staff seed.
5. Drift check: comparar el archivo del repo con `statements[0]` en `supabase_migrations.schema_migrations` (módulo el newline final POSIX).
6. `npm run lint` y `npm run build` siguen verdes (no se toca código de la app).
7. Commit + PR en la rama `spec-09-users-table-enums-and-staff-seed`.

## Acceptance criteria

- [ ] Existe `supabase/migrations/02-create_users_enums_and_auth_trigger.sql` commiteado y contiene el SQL del Data model.
- [ ] `apply_migration` con nombre `02_create_users_enums_and_auth_trigger` devuelve `success: true` (registro en `supabase_migrations.schema_migrations`).
- [ ] Existen los enums `public.user_role` (`staff`, `parent`, `admin`) y `public.user_status` (`pending`, `active`).
- [ ] `public.users` tiene todas las columnas esperadas: `id uuid PK+FK→auth.users`, `daycare_id uuid FK→daycares`, `role user_role`, `status user_status default 'active'`, `full_name text not null`, `avatar_url text`, `notify_on_post bool default true`, `daily_summary_enabled bool default true`, `created_at timestamptz default now()`.
- [ ] Existen `users_daycare_id_idx` y `users_role_idx` (verificado vía `pg_indexes`).
- [ ] `pg_class.relrowsecurity = true` para `users`.
- [ ] `pg_policy` lista exactamente 1 policy: `users_select_authenticated` (cmd `r`). Sin policies `i/u/d`.
- [ ] Existe el trigger `on_auth_user_created` AFTER INSERT ON `auth.users` (verificado vía `pg_trigger`).
- [ ] Insertar un `auth.users` adicional con `raw_user_meta_data` válido vía `execute_sql` crea automáticamente una fila en `public.users` con los campos correctos. Tras la prueba, ambas filas (auth + public) se eliminan para dejar solo el staff seed.
- [ ] El staff seed está creado: `auth.users.email = 'staff@opendaycare.com'`, `public.users.full_name = 'Staff Sala Soles'`, `role = 'staff'`, `status = 'active'`, `daycare_id` apuntando a Guardería Sala Soles, `avatar_url is null`, `notify_on_post = true`, `daily_summary_enabled = true`.
- [ ] `select * from public.users` ejecutado por `anon` devuelve 0 filas (sin policy `select` para `anon`).
- [ ] `select * from public.users` ejecutado por `authenticated` devuelve 1 fila (policy `select` abierta).
- [ ] Drift check: archivo del repo == `statements[0]` salvo newline final (POSIX añade `\n` al archivo; `schema_migrations.statements[]` descarta ese newline al almacenar — esperado, no es drift real).
- [ ] `npm run lint` y `npm run build` pasan sin errores (no se modificó código de la app).

## Decisions

- **Sí:** tabla `users` + enums + trigger de sincronización + seed, todo en este spec. Es la unidad lógica completa para que un usuario autenticado tenga su fila de dominio.
- **Sí:** trigger copia `raw_user_meta_data → public.users`. No propaga a `raw_app_meta_data` (lo necesitará el hook del JWT, que va con el spec de auth).
- **Sí:** RLS con patrón abierto (`using (true)` para `authenticated`, sin policies de escritura), idéntico al de SPEC 08. Endurecimiento multi-tenant va con el spec de auth. Decidido por el usuario.
- **No:** Edge Function `custom-access-token` ni configuración manual del hook. Sin RLS multi-tenant no son necesarios hoy.
- **No:** `updated_at` + trigger `set_updated_at`. Consistente con SPEC 08; se añade cuando haya un caso real de edición de perfil.
- **No:** policies de `insert/update/delete`. Escritura via migraciones o `service_role`.
- **Sí:** seed del staff dentro de la migración (inserción directa en `auth.users`), reproducible y atómico. El trigger crea la fila en `public.users`.
- **Sí:** password del staff `staff1234` hasheada con `crypt('staff1234', gen_salt('bf'))`. Compatible con el formato bcrypt que Supabase Auth espera internamente.
- **No:** RLS endurecida en `daycares`/`rooms` en este spec. El switch futuro es trivial (`using (true)` → `using (id = (auth.jwt() ->> 'daycare_id')::uuid)` en daycares, y `daycare_id = ...` en rooms). Mantener este spec enfocado.
- **Sí:** convención `supabase/migrations/NN-<slug>.sql` (NN secuencial = 02) + `apply_migration` con `02_create_users_enums_and_auth_trigger`. Heredado de SPEC 08.
- **No:** script de verificación reusable. La verificación end-to-end queda como queries MCP descritas en el plan; crear un script sería scope creep hasta que llegue el spec de auth real.
- **No:** tests RLS automatizados (pgTAP está disponible pero añade complejidad). La verificación es por queries MCP con `set local role`.

## Risks

| Risk | Mitigation |
| --- | --- |
| El trigger lee `role` y `daycare_id` desde `raw_user_meta_data` (input del usuario). Un signup futuro podría auto-asignarse `role='admin'` | Cuando llegue el spec de auth, el flujo de signup se controla server-side y nunca se expone `role` al cliente. Adicionalmente, el trigger puede endurecerse para validar que `role` solo venga de invitaciones staff. Documentado para el spec de auth. |
| Insertar directo en `auth.users` puede fallar por columnas requeridas no visibles en `list_tables` (triggers internos, validaciones) | El insert va dentro de la migración con todas las columnas explícitas (`instance_id`, `aud`, `role`, `email_confirmed_at`, etc.); el `email_confirmed_at = now()` evita el flujo de confirmación |
| El trigger `AFTER INSERT ON auth.users` se ejecuta con el rol del insert; si el rol no es `postgres`/`service_role`, podría fallar | La migración corre con permisos elevados; documentado para que inserciones manuales (futuro) también usen `service_role` |
| `crypt('staff1234', gen_salt('bf'))` produce un hash bcrypt con salt aleatorio: dos aplicaciones de la migración no son byte-idénticas en el INSERT del seed | El INSERT no forma parte del drift check de "archivo == SQL aplicado" porque la función `crypt()` se evalúa en el servidor (no en el archivo); el diff sigue dando IDENTICAL para el resto del SQL. Si el drift check falla por esto, se documenta como caso conocido y se excluye el INSERT del seed del diff |
| RLS abierta (`using (true)`) significa que cualquier `authenticated` puede leer cualquier fila de `users` mientras no llegue el spec de auth | Compatible con SPEC 08 (mismo patrón en `daycares`/`rooms`); el endurecimiento multi-tenant es el siguiente paso natural cuando llegue auth. La app actual no expone datos sensibles de `users` a otros usuarios en pantalla |
| El staff seed queda con `raw_app_meta_data = '{}'` (sin `daycare_id` ni `role`). Si antes del spec de auth se intenta leer claims, no aparecerán | Aceptable: el spec de auth añadirá el `update raw_app_meta_data` correspondiente y/o desplegará el hook. Mientras tanto, el `public.users` row ya tiene los datos correctos |

## What is **not** in this spec

- Edge Function `custom-access-token` ni Custom Access Token Hook.
- Configuración del hook en Supabase Dashboard.
- Propagación de campos a `raw_app_meta_data` en el trigger.
- RLS multi-tenant estricto (claim `daycare_id` en JWT).
- Endurecimiento de RLS en `daycares`/`rooms`.
- Auth real, sign-up/sign-in funcional, magic link, OAuth.
- Las páginas `/login` y `/activate` siguen siendo mocks; la integración con Supabase Auth es para un spec futuro.
- `updated_at` y triggers asociados.
- Tablas `children`, `parent_children`, `invitations`, `posts`, `post_children`, `post_photos`, `reactions`, `comments`, `daily_summaries`, `devices`.
- Enums `relationship_type`, `invitation_status`, `post_type`, `child_status`.
- Policies de `insert/update/delete` en `users`.
- Avatar uploads (Storage).
- UI de gestión de usuarios (panel admin, edición de perfil).
- Tests automatizados (pgTAP, scripts reutilizables).

Cada una de esas, si llega, va en su propio spec.
