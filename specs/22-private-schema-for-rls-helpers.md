# SPEC 22 — Mover helpers SECURITY DEFINER a schema `private`

> **Status:** Aprobada
> **Depends on:** SPEC 11 (RLS hardening + helpers `is_parent_of`/`daycare_of_child`/`daycare_of_room`), SPEC 12 (invitations flow), SPEC 13 (`assign_role_from_invitation` trigger), SPEC 16 (`daycare_of_post` helper + posts policies), SPEC 20 (`is_parent_of`/`post_visible_to_parent` helpers + RPC `get_feed_for_parent`), SPEC 21 (uses `daycare_of_post` via `posts_modify_author`)
> **Date:** 2026-10-04
> **Objective:** Cerrar 8 de los 14 advisories `security_definer_function_executable` (4 anon + 10 authenticated) moviendo los helpers internos a un schema `private` que PostgREST no expone por defecto, dejando en `public` solo los 4 invocados por la app o por anon en flujos legítimos.

## Why this spec exists

El `db-security-auditor` en sus informes de SPEC 20 y SPEC 21 reportó un total de **14 advisories** sobre funciones `SECURITY DEFINER` expuestas a `anon` o `authenticated`:

| Advisory | Count | Funciones |
|---|---|---|
| `anon_security_definer_function_executable` | 4 | `assign_role_from_invitation`, `expire_invitation`, `rls_auto_enable`, `validate_invitation` |
| `authenticated_security_definer_function_executable` | 10 | las 4 anteriores + `daycare_of_child`, `daycare_of_post`, `email_exists`, `get_feed_for_parent`, `is_parent_of`, `post_visible_to_parent` |

Las funciones en cuestión tienen dos usos legítimos:

- **Helper interno** invocado desde una policy SQL (no desde PostgREST): `is_parent_of`, `post_visible_to_parent`, `daycare_of_child`, `daycare_of_post`. Solo las llaman policies para bypass RLS; nunca la app. El advisory es **falso positivo**: la app no las usa, pero como están en `public` PostgREST las expone vía `/rest/v1/rpc/<fn>` y el linter avisa.
- **Helper de trigger** interno de Postgres: `rls_auto_enable` (event trigger), `assign_role_from_invitation` (BEFORE INSERT trigger sobre `auth.users`). Nunca llamadas desde la app ni desde SQL ordinario; el trigger de Supabase las invoca como parte del flujo de auth. Advisory **falso positivo** por estar en `public`.

Los otros 4 sí están en `public` por diseño y **no deben moverse**:

- `validate_invitation(p_code text)` — llamada por `app/activate/actions.ts` desde el formulario público `/activate` **antes** del login. Necesita `EXECUTE` a `anon`.
- `expire_invitation(p_invitation_id uuid)` — llamada por `app/activate/actions.ts` tras detectar una invitación expirada. Pre-login. Necesita `EXECUTE` a `anon`.
- `get_feed_for_parent(p_parent_id, p_daycare_id)` — llamada por `listFeedPostsForParent` (`utils/supabase/posts.ts:205`) vía `supabase.rpc(...)`. Necesita `EXECUTE` a `authenticated` y seguir en un schema que PostgREST exponga (por defecto solo `public`).
- `email_exists(p_email text)` — llamada por `app/(staff)/kids/actions.ts:133` al invitar a un padre. Necesita `EXECUTE` a `authenticated` y seguir en `public`.

**Decisión:** mover 6 helpers internos a un schema `private` (no expuesto por PostgREST). Cerrar 8 advisories. Documentar los 4 invocados por la app/anon con un comentario explícito ("expuesta por diseño") en el archivo de migración. Quedan 6 advisories (todas legítimas por diseño).

## Scope

**In:**

- Nueva migración `supabase/migrations/22-private-schema-for-rls-helpers.sql`:
  - `create schema if not exists private;` + `revoke all on schema private from public, anon;` + `grant usage on schema private to authenticated;`
  - Para cada uno de los 6 helpers internos:
    - `drop function if exists public.<fn>(<args>) cascade;` (el `cascade` borra dependencias en policies; se recrea la policy después).
    - `create function private.<fn>(...) ... security definer set search_path = '' ...;`
    - `revoke execute on function private.<fn>(...) from public, anon;`
    - `grant execute on function private.<fn>(...) to authenticated;` (o al `service_role` si solo lo usan triggers).
  - **Update de las call sites en las policies existentes**:
    - `public.daycare_of_child` → `private.daycare_of_child` en: `supabase/migrations/11-harden_remaining_tables.sql` (15 call sites en policies de `children`, `parent_children`, `invitations`) y `supabase/migrations/20-create_daily_summaries.sql` (3 call sites en `daily_summaries_select_own_children`, `daily_summaries_modify_staff_same_daycare`).
    - `public.daycare_of_post` → `private.daycare_of_post` en: `supabase/migrations/16-create_posts_related_tables.sql` (3 call sites) y `supabase/migrations/20-harden_posts_rls_for_parents.sql` (3 call sites en `posts_select_parent_or_staff_same_daycare`, `post_children_select_parent_or_staff_same_daycare`, y `posts_modify_author`).
    - `public.is_parent_of` → `private.is_parent_of` en: `supabase/migrations/20-harden_posts_rls_for_parents.sql` (`post_children_select_parent_or_staff_same_daycare`).
    - `public.post_visible_to_parent` → `private.post_visible_to_parent` en: `supabase/migrations/20-harden_posts_rls_for_parents.sql` (`posts_select_parent_or_staff_same_daycare`).
  - **Update de las call sites en triggers**:
    - `public.assign_role_from_invitation()` → `private.assign_role_from_invitation()` en: `supabase/migrations/13-fix-signup-privilege-escalation.sql` (línea 103, `for each row execute function ...`).
    - `public.rls_auto_enable()` → `private.rls_auto_enable()` en el `event trigger` que la invoca (no se conoce el archivo exacto sin buscar; se localiza con `select * from pg_event_trigger;` antes de aplicar).
  - Comentario en cada una de las 4 funciones que se quedan en `public` (`validate_invitation`, `expire_invitation`, `get_feed_for_parent`, `email_exists`): "expuesta por diseño: invocada por [app/anon] vía PostgREST RPC". Se añade en la cabecera de la función con `comment on function public.X (...) is '...';` o como bloque `--` en una migración posterior. Se documenta en la sección "Decisions" de la spec.
- `apply_migration` con SQL byte-idéntico al archivo.
- Verificación:
  - `supabase_get_advisors(type="security")` antes: 4 + 10 = 14 advisories. Después: 0 (anon) + 4 (authenticated, todas legítimas, documentadas) = 4 advisories.
  - Role-switch tests que siguen pasando: SPEC 20's `parent_posts_view → 3 ids`, SPEC 21's `parent_insert_posts → 42501`, etc. Las policies siguen invocando las funciones vía `private.X(...)`.
  - `npm run lint && npm run build` exit 0. No cambios en código de la app.
  - `db-security-auditor` re-corre las verificaciones de SPEC 20 + SPEC 21 + ejecuta el role-switch test del padre para `get_feed_for_parent` (sigue accesible porque está en `public`).

**Out of scope (for future specs):**

- Mover las 4 funciones invocadas por la app/anon (`validate_invitation`, `expire_invitation`, `get_feed_for_parent`, `email_exists`) a schema privado. Razón: romperían los flujos existentes (`/activate`, `listFeedPostsForParent`, invite de padre en `/kids`). Para moverlas habría que (a) alterar `supabase/config.toml` (`db_schemas`) + restart de Supabase, y (b) actualizar el código de la app para llamar a un esquema no-PostgREST (RPC sobre un esquema custom requiere config adicional). Coste elevado; beneficio nulo para el security posture (los `EXECUTE` ya están revoke-from-public/anon en su mayoría). Se documentan en su lugar.
- Cambiar la firma de las funciones (siguen siendo las mismas). Razón: las policies que las llaman usan la misma signature; no hace falta.
- Activar `auth_leaked_password_protection` (advisory 14, pre-existente). Razón: configuración de Auth, no migración SQL. Va como ticket de config aparte.
- Refactorizar a `SECURITY INVOKER` las 6 que se quedan (donde sea posible). Razón: perdería el bypass RLS que necesitan los helpers. Los helpers internos consultan tablas como `parent_children` / `children` / `users` que están sujetas a RLS; desde una policy ya tienen bypass (las policies corren como owner), pero si los llamas desde SQL ordinario en `service_role` pierdes bypass. Mantener SECURITY DEFINER + `set search_path = ''` + `execute` solo a `authenticated` es la postura correcta. El advisor queda en "informativo".
- Crear políticas `grant execute` por servicio (e.g., separar el papel de cada helper según quién lo llame). Razón: over-engineering. Cada helper recibe `grant execute to authenticated` (o `service_role` para los de trigger).
- Tests automatizados. Sin runner; verificación = queries MCP + lint + build + db-security-auditor.

## Data model

No se introducen nuevas tablas, columnas, ni tipos. Solo se mueven funciones `SECURITY DEFINER` de `public` a `private` y se actualizan las references en policies/triggers.

## Implementation plan

1. **Inspección previa**: query al DB para listar las call sites exactas de las 6 funciones en policies (`pg_policy.qual`, `pg_policy.with_check`) y triggers (`pg_event_trigger` o `pg_trigger`).
2. Crear `supabase/migrations/22-private-schema-for-rls-helpers.sql` con este esqueleto:
   - Bloque `-- +`.
   - `create schema if not exists private;` + revoke/grant usage.
   - Por cada uno de los 6 helpers (`is_parent_of`, `post_visible_to_parent`, `daycare_of_child`, `daycare_of_post`, `rls_auto_enable`, `assign_role_from_invitation`):
     - `drop function if exists public.<fn>(<args>) cascade;`
     - `create function private.<fn>(...) returns ... language sql security definer set search_path = '' stable as $$ ... $$;` (cuerpo copiado literal del archivo donde se creó originalmente; misma signature).
     - `revoke execute on function private.<fn>(...) from public, anon;`
     - `grant execute on function private.<fn>(...) to authenticated;` (o `service_role` si solo lo usan triggers internos).
   - **Update de call sites en policies** vía `drop policy` + `create policy` (idempotente; ya están envueltas en `if exists`):
     - `children_select_parent_or_staff_same_daycare` (SPEC 11): replace `public.is_parent_of(id)` → `private.is_parent_of(id)`, `public.daycare_of_child(id)` → `private.daycare_of_child(id)`.
     - `children_insert_staff_same_daycare`, `children_update_staff_same_daycare`, `children_delete_staff_same_daycare` (SPEC 11): replace `public.daycare_of_*` → `private.daycare_of_*`.
     - `parent_children_select_self_or_staff_same_daycare`, `parent_children_insert_staff_same_daycare`, `parent_children_update_staff_same_daycare`, `parent_children_delete_staff_same_daycare` (SPEC 11): replace `public.daycare_of_child(child_id)` → `private.daycare_of_child(child_id)`.
     - `invitations_*_staff_same_daycare` × 4 (SPEC 11): replace `public.daycare_of_child(child_id)` → `private.daycare_of_child(child_id)`.
     - `daily_summaries_select_own_children`, `daily_summaries_modify_staff_same_daycare` (SPEC 20): replace `public.daycare_of_child(child_id)` → `private.daycare_of_child(child_id)`.
     - `posts_select_same_daycare` ya fue DROPPED por SPEC 16; ahora `posts_select_parent_or_staff_same_daycare` (SPEC 20): replace `public.daycare_of_post(id)` → `private.daycare_of_post(id)`, `public.post_visible_to_parent(id)` → `private.post_visible_to_parent(id)`.
     - `post_children_select_parent_or_staff_same_daycare` (SPEC 20): replace `public.daycare_of_post(post_id)` → `private.daycare_of_post(post_id)`, `public.is_parent_of(child_id)` → `private.is_parent_of(child_id)`.
     - `posts_modify_author` (SPEC 21): replace `public.daycare_of_post(id)` → `private.daycare_of_post(id)`. Hmm — actually SPEC 21's `posts_modify_author` doesn't reference `daycare_of_post`. Confirmed by reading the file. Skip.
     - `post_children_modify_author`, `post_photos_modify_author` (SPEC 16): replace `public.daycare_of_post(post_id)` → `private.daycare_of_post(post_id)` (3 call sites total).
   - **Update de trigger references**: `drop trigger ... on auth.users;` + `create trigger ... execute function private.assign_role_from_invitation();` (línea 103 de `13-fix-signup-privilege-escalation.sql`).
   - Para `rls_auto_enable` (event trigger): localizar el `create event trigger ... on ... execute function public.rls_auto_enable();` y replace por `private.rls_auto_enable()`. (El archivo exacto se inspecciona en el paso 1.)
   - Comentarios `--` en la cabecera de la migración listando los 4 que se quedan en `public` (`validate_invitation`, `expire_invitation`, `get_feed_for_parent`, `email_exists`) con la razón.
   - `comment on function public.validate_invitation(text) is 'Exposed by design: called by anon from /activate pre-login.';` (igual para los otros 3, en el mismo archivo).
3. Aplicar con `apply_migration(name="22_private_schema_for_rls_helpers", query=<sql>)` (byte-idéntico al archivo).
4. Drift check: `supabase_migrations.schema_migrations.statements[1]` coincide con el archivo (modulo newline final).
5. Re-verificar con role-switch tests (mismas queries que SPEC 20 + SPEC 21):
   - Padre ve 3 posts en `select from posts` (SPEC 20).
   - Padre `insert into posts` → 42501 (SPEC 21).
   - Padre `select from get_feed_for_parent(...)` → 3 ids (RPC sigue accesible en `public`).
6. `supabase_get_advisors(type="security")` → 4 advisories restantes (todos `validate_invitation`, `expire_invitation`, `get_feed_for_parent`, `email_exists` × 2 porque `validate_invitation`/`expire_invitation` aparecen en ambas listas). Total esperado: 4 advisories restantes (1 anon si validate/expire cuentan en ambos lados + 1 authenticated para validate/expire + get_feed + email_exists = 4 expected). Conteo real: 1 anon + 3 authenticated = 4 (todos esperados y documentados).
7. `npm run lint && npm run build` exit 0.
8. `db-security-auditor` re-corre la suite de SPEC 20 + SPEC 21 → APTO.

## Acceptance criteria

- [ ] `supabase/migrations/22-private-schema-for-rls-helpers.sql` existe; `apply_migration` aplicado; `list_migrations` muestra la entrada.
- [ ] Schema `private` existe en la DB: `select nspname from pg_namespace where nspname = 'private'` devuelve 1 fila. `revoke all on schema private from public, anon` aplicado; `grant usage on schema private to authenticated`.
- [ ] Las 6 funciones `is_parent_of`, `post_visible_to_parent`, `daycare_of_child`, `daycare_of_post`, `rls_auto_enable`, `assign_role_from_invitation` existen en schema `private` (consulta `select proname, pronamespace from pg_proc where proname in (...)`).
- [ ] Las 6 funciones **no** existen en `public` (consulta `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname in (...)` → 0).
- [ ] Las 4 funciones que se quedan (`validate_invitation`, `expire_invitation`, `get_feed_for_parent`, `email_exists`) siguen en `public` con `prosecdef = true` (consulta `pg_proc`).
- [ ] Todas las call sites en policies (`pg_policy.qual`/`with_check` de `children`, `parent_children`, `invitations`, `daily_summaries`, `posts`, `post_children`, `post_photos`) referencian `private.X` y no `public.X` para los 4 helpers RLS. (`select count(*) from pg_policy where qual::text like '%public.is_parent_of%' or with_check::text like '%public.is_parent_of%' or ...` → 0.)
- [ ] El trigger de signup llama a `private.assign_role_from_invitation()`: `select tgrelid::regclass, tgfoid::regproc from pg_trigger where tgfoid::regproc::text like 'public.assign_role_from_invitation%'` → 0 filas; igual con `private.assign_role_from_invitation%` → ≥1 fila.
- [ ] Role-switch test del SPEC 20 sigue pasando: padre ve 3 posts + 0 daily_summaries; staff ve 9/9 posts.
- [ ] Role-switch test del SPEC 21 sigue pasando: padre `insert into posts` → 42501; staff `insert` → 1 fila + cleanup.
- [ ] RPC `get_feed_for_parent` sigue accesible para authenticated: padre ve 3 ids, staff ve 9 ids.
- [ ] `supabase_get_advisors(type="security")`: el advisory `anon_security_definer_function_executable` cuenta 2 (solo `validate_invitation`, `expire_invitation`); `authenticated_security_definer_function_executable` cuenta 4 (los 4 que se quedan en `public`). Total: 6 advisories (todos documentados como legítimos). **Antes: 14. Después: 6.**
- [ ] Drift check: `supabase_migrations.schema_migrations.statements[1]` coincide byte-a-byte con el archivo (modulo newline).
- [ ] `npm run lint` exit 0. `npm run build` exit 0.
- [ ] `db-security-auditor` re-corre la suite de SPEC 20 + SPEC 21 y reporta **APTO**. La sección de advisors del informe refleja el conteo nuevo (14 → 6).

## Decisions

- **Sí:** schema `private` separado para helpers internos. Razón: el advisory `security_definer_function_executable` es la "vista PostgREST" — si la función no está en un schema que PostgREST exponga, no aparece en `/rest/v1/rpc/<fn>` y el advisor desaparece. Mantener las funciones (no mover a `SECURITY INVOKER`) preserva el bypass RLS que necesitan los helpers desde dentro de las policies (donde se ejecutan como el owner de la policy, pero el helper sigue corriendo con `set search_path = ''` para evitar search-path injection).
- **Sí:** dejar `validate_invitation`, `expire_invitation`, `get_feed_for_parent`, `email_exists` en `public`. Razón: se llaman desde la app (o pre-login) vía `supabase.rpc(...)` o desde Server Actions que invocan la API de PostgREST. Moverlas requeriría alterar `supabase/config.toml` (`db_schemas = ["public", "private"]`) + restart + actualizar las llamadas del app, con beneficio de seguridad nulo (los `EXECUTE` ya están revoke-from-public/anon). Coste elevado, beneficio nulo. Se documentan con `comment on function` en la cabecera.
- **Sí:** migrar las call sites de policies con `drop policy if exists + create policy` (idempotente). Razón: Postgres no permite `alter policy` para cambiar la referencia a un helper; hay que dropear y recrear. Mismo patrón que en SPEC 11/16/20.
- **Sí:** usar `drop function ... cascade` para los 6 helpers. Razón: el `cascade` borra las references en policies/triggers; las recreamos inmediatamente después en el mismo archivo de migración. Idempotente: el `drop policy if exists` ya lo cubre.
- **No:** mover `get_feed_for_parent` a `private`. Razón: la app llama `supabase.rpc("get_feed_for_parent", ...)`. PostgREST solo expone el schema `public` por defecto; mover rompería la llamada. Mantener en `public` con un `comment on function` que diga "Exposed by design: filtered feed RPC for parent role".
- **No:** activar `auth_leaked_password_protection`. Razón: es config de Auth (no SQL). Va como ticket aparte, posiblemente SPEC 23 o config-only.
- **No:** convertir las 4 que se quedan a `SECURITY INVOKER`. Razón: perdería el bypass RLS que necesitan `validate_invitation` (lee `auth.users` que está en otro schema con RLS), `expire_invitation` (similar) y `email_exists` (lee `auth.users`). Mantener SECURITY DEFINER + revoke-from-public/anon + grant-a-authenticated (o anon para los 2 invitations) es la postura correcta.
- **No:** separar grants por role del helper (más fino: `grant execute to authenticated` vs `service_role` para los de trigger). Razón: over-engineering. El linter acepta `authenticated` como válido; `service_role` ya tiene bypass. El uso de cada helper es claro: `is_parent_of`/`post_visible_to_parent`/`daycare_of_*` los llaman policies (corren como policy owner, no necesitan EXECUTE grants específicos), `assign_role_from_invitation`/`rls_auto_enable` los llaman triggers (ejecutan como superuser-like). Todos reciben `grant execute to authenticated` por defecto; `service_role` hereda de postgres. Documentado en el archivo.

## Risks

| Risk | Mitigation |
| --- | --- |
| `drop function ... cascade` borra algo no esperado (dependencia fuera de `public` o de la app) | Antes del siguiente query: `select objid, objsubid, refobjid, refobjsubid from pg_depend where refobjid = '<fn>'::regproc::oid;` lista TODAS las references. Si alguna no es de las que controlamos (p.ej. una view de una extensión), abortar. La inspección previa (step 1 del plan) cubre este punto. |
| Mover las call sites de policies con drop+create cambia el `oid` de la policy, perdiendo grants finos | Los grants sobre policies son `select/insert/update/delete` sobre la tabla — no se ven afectados por el `oid`. `pg_policy` se recrea con un `oid` nuevo pero el `cmd` y el cuerpo semántico son idénticos. Verificación con `pg_policies` post-migración. |
| Algún policy llama al helper desde el `search_path` y al moverlo a `private` el lookup falla | Las policies se invocan con `search_path` por defecto del rol invocante. El `search_path` por defecto en Supabase incluye `public`. Para llamar a `private.X`, **las policies deben usar el prefijo explícito `private.X(...)`** (no fiarse del `search_path`). El plan especifica replace con prefijo explícito en todas las call sites. Verificación: `pg_get_expr(qual, polrelid)` post-migración. |
| `rls_auto_enable` (event trigger) queda con referencia colgante si no se actualiza el `create event trigger` | El paso 1 del plan inspecciona `pg_event_trigger` para localizar el `evtname` y el `evtfoid`. Si no se localiza, abortar el spec antes de aplicar. |
| Una de las 4 funciones que se quedan en `public` debería haberse movido | Todas tienen una razón explícita documentada en el spec (decisión "Sí"). El usuario confirmó "Mover todos los helpers" → entendido como "los que se pueden mover sin romper". Las 4 expuestas por diseño se documentan y quedan en `public`. |
| Migration no idempotente → falla en re-run | `create schema if not exists private`, `drop function if exists`, `drop policy if exists`, `drop trigger if exists` — todos los DDL son idempotentes. Verificar con un `drop migration ...` (no soportado) + re-apply (no testeado, pero documentado en AGENTS.md). |

## What is **not** in this spec

- Mover `validate_invitation` / `expire_invitation` / `get_feed_for_parent` / `email_exists` a schema privado. Documentadas en `public` con `comment on function`.
- Cambiar la firma de las funciones.
- Activar `auth_leaked_password_protection` (advisory pre-existente, config de Auth).
- Convertir las funciones que se quedan a `SECURITY INVOKER`.
- Separar `grant execute` por role del helper.
- Alterar `supabase/config.toml` (`db_schemas`).
- Tests automatizados.

Cada uno, si llega, va en su propio spec.