# SPEC 21 — Endurecer `posts_modify_author` con filtro `role='staff'`

> **Status:** Implemented
> **Depends on:** SPEC 16 (posts/post_children/post_photos + policies), SPEC 20 (auditor finding)
> **Date:** 2026-10-04
> **Objective:** Cerrar la fuga en `posts_modify_author` (FOR ALL) que permite a un `role='parent'` INSERTar `posts` con `author_id = auth.uid()`, añadiendo el mismo filtro `role='staff'` que ya tienen `post_children_modify_author` y `post_photos_modify_author`.

## Why this spec exists

El `db-security-audit 20` (informe post-impl SPEC 20) detectó un **hallazgo crítico pre-existente** en `posts_modify_author` (CREATED in `supabase/migrations/16-create_posts_related_tables.sql:166-170`):

```sql
create policy posts_modify_author
  on public.posts for all
  to authenticated
  using       (author_id = (select auth.uid()))
  with check  (author_id = (select auth.uid()));
```

El policy **no** filtra por rol. Como `posts_modify_author` es `FOR ALL` (permissive) y se OR-ea con `posts_insert_staff` (cmd `a`/INSERT, sí exige `role='staff'`), un padre autenticado con `app_metadata.role='parent'` puede:

- `INSERT` un `posts` con `author_id = auth.uid()` y los defaults `posts_insert_staff` admite porque… **no los admite**: `posts_insert_staff` exige `role='staff'`. Pero la *combinación* permissive de `posts_modify_author` (FOR ALL) + `posts_insert_staff` (INSERT) hace que la INSERT pase si **alguna** de las dos policies la acepta. Y `posts_modify_author` solo mira `author_id = auth.uid()` → **pasa**. La fila se persiste.
- `UPDATE` y `DELETE` de cualquier `posts` cuyo `author_id = auth.uid()` — también abusable si un padre llega a tener un post (p.ej. tras la fuga de INSERT).

El test #11 del auditor reprodujo el bug: `parent zeionsoft` insertó `"padre intento Y"` y la fila quedó persistida y visible en el feed familiar.

**No es fuga de privacidad entre padres** (no puede impersonar a staff; `author_id` solo puede ser sí mismo). Pero rompe el modelo de "solo staff publica" de SPEC 16 y aparece como contenido real en el feed de los padres. El SPEC 20 heredó el agujero sin tocarlo (la sección "Out of scope" excluye `posts_modify_author` explícitamente).

Las policies equivalentes `post_children_modify_author` y `post_photos_modify_author` **sí** incluyen el filtro `role='staff'` (verificado en DB viva) — son el patrón a seguir.

## Scope

**In:**

- Nueva migración `supabase/migrations/21-harden-posts-modify-author.sql`:
  - `drop policy if exists posts_modify_author on public.posts`.
  - `create policy posts_modify_author` (`FOR ALL`, `to authenticated`) con `using` y `with check` que exigen **además** de `author_id = (select auth.uid())`: `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'`.
  - Mismo patrón textual que `post_children_modify_author` y `post_photos_modify_author` (consistencia).
- Aplicar con `apply_migration(name="21_harden_posts_modify_author", query=<sql>)`.
- Verificación con role-switch en la DB:
  - `set local role authenticated` + JWT de un padre → `insert into public.posts (...)` debe fallar con `42501` (permission denied).
  - Mismo setup con JWT de `staff` → `insert` debe pasar.
  - Padre no puede `update`/`delete` posts existentes (excepto los suyos propios que ya no pueden existir porque la INSERT está bloqueada).
- Regenerar `types/supabase.ts` con `supabase_generate_typescript_types` (puede no cambiar, pero el paso queda documentado por consistencia con specs anteriores).
- Run `npm run lint && npm run build` (no cambia código de la app, pero el spec requiere verificación verde).

**Out of scope (for future specs):**

- Dividir `posts_modify_author` (`FOR ALL`) en `posts_update_author` + `posts_delete_author` (auditor's "alternative fix"). Razón: el minifix es suficiente y evita proliferación de policies; el split solo tendría sentido si se quisiera relajar la regla para UPDATE/DELETE en otra fase.
- Refactor análogo para `post_children_modify_author` / `post_photos_modify_author`: **no** les hace falta, ya tienen el filtro `role='staff'` (verificado).
- Cambio en la lógica de la UI (`NewPostModal`, `createPostAction`): la app ya solo expone la creación al usuario staff (el composer está dentro de `StaffShell`). No hay camino UI para que un padre publique. La fuga era exclusivamente por SQL directo (RLS).
- Auditoría de otras policies `FOR ALL` en el proyecto (p.ej. `daily_summaries_modify_staff_same_daycare`, `children_update_staff_same_daycare`, etc. ya tienen filtro por rol explícito — no requieren fix).
- Cierre del rol `parent` en `parent_children` / `invitations` / `children` etc. — ya están endurecidos en SPEC 11/12. Sin cambios.

## Data model

No se introducen nuevas estructuras. Solo se reemplaza la policy `posts_modify_author` de la DB.

## Implementation plan

1. Crear `supabase/migrations/21-harden-posts-modify-author.sql` con el `drop policy` + `create policy` exactos del snippet del auditor (líneas 235–244 del informe `db-security-audit 20`).
2. Aplicar con `apply_migration(name="21_harden_posts_modify_author", query=<sql>)` (byte-idéntico al archivo; verificar después con `list_migrations` para confirmar `statements[0]` coincide salvo newline final).
3. Verificación role-switch con `supabase_execute_sql` (en transacción `begin/commit` con `set_config('request.jwt.claims', ..., true)` y `set local role authenticated`):
   - **parent INSERT → 42501**: zeionsoft + `insert into public.posts (author_id, type, body) values (auth.uid(), 'announcement', 'intento C1')` debe devolver `ERROR 42501`.
   - **staff INSERT → 1 fila**: staff + mismo INSERT debe insertar una fila y devolverla en `returning *`.
   - **staff DELETE/cleanup**: `delete from public.posts where body='intento C1'` (con mismo JWT staff) para no dejar basura del test.
   - **pg_policy**: `select policyname, cmd, qual from pg_policies where policyname='posts_modify_author'` debe mostrar `cmd='ALL'`, `qual` con `role='staff'`, `with_check` con `role='staff'`.
4. Drift check: el archivo aplicado coincide con `supabase_migrations.schema_migrations.statements[0]` (modulo el newline final — Supabase lo descarta al almacenar).
5. Regenerar `types/supabase.ts` con `supabase_generate_typescript_types` (la policy no afecta tipos, pero el paso queda documentado; commit si hay diff, o `git diff --stat` muestra 0 cambios esperados).
7. `npm run lint && npm run build` exit 0. No hay cambios en código de la app, así que es un sanity check.
8. Verificación final con `db-security-auditor`: re-correr el test #11 del informe (padre intenta `insert into public.posts ...`) — ahora debe devolver `42501`.

## Acceptance criteria

- [x] `supabase/migrations/21-harden-posts-modify-author.sql` existe; `apply_migration` aplicado; `list_migrations` muestra la entrada — ok: `supabase_list_migrations` → `{name:"21_harden_posts_modify_author", version:"20261004091823"}`. Archivo 1863 bytes.
- [x] `pg_policy` en `public.posts` muestra exactamente 1 policy llamada `posts_modify_author` con `cmd='ALL'` y con `qual`/`with_check` que incluyen `(select auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'` (además de `author_id = (select auth.uid())`) — ok: `pg_policies` devuelve `posts_modify_author` con `qual="((author_id = (SELECT auth.uid())) AND ((SELECT ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text)) = 'staff'::text))"` y `with_check` idéntico. Postgres añade casts `::text` al almacenar, semánticamente equivalentes.
- [x] `pg_policy` en `public.post_children` y `public.post_photos` mantiene sus policies `*_modify_author` con filtro `role='staff'` intactas (sin cambios) — ok: ambas `cmd='ALL'`, `qual`/`with_check` contienen `= 'staff'::text` (junto al EXISTS sobre `posts` para validar autoría). Ningún cambio respecto a SPEC 16/20.
- [x] Drift check OK: `supabase_migrations.schema_migrations.statements[0]` del registro de la nueva migración coincide byte-a-byte con el archivo (modulo el newline final) — ok: `md5(statements[1])=md5(file)='5aa940ca6883901b8ba6b7c4216dabd1'`, `octet_length=1863`. (Nota: el criterio dice `statements[0]`, pero PG es 1-indexed → usar `statements[1]`; el contenido es idéntico.)
- [x] Role-switch test padre (zeionsoft, `15f06b4c-a727-4b1f-bf06-6051757c573f`, daycare `a528311f-2757-4340-906a-ce3d042abcd9`) — ok: `set local role authenticated; set_config('request.jwt.claims', '{"sub":"15f06b4c-…","app_metadata":{"role":"parent","daycare_id":"a528311f-…"}}')` + `insert into public.posts (author_id, type, body) values ('15f06b4c-…'::uuid, 'announcement', 'intento C1') returning id` → `ERROR 42501: new row violates row-level security policy for table "posts"`. Cleanup verificado: `count(*) where body like 'intento C1%' = 0`.
- [x] Role-switch test staff (Alberto, `ad14ad50-85ca-45ee-9167-4cce9f9beeb7`, mismo daycare) — ok: mismo INSERT (con body `'intento C1 staff OK'`) devuelve `id='f1901876-1beb-42ca-b10c-d1bf607b7045'`, `author_id=ad14ad50-…`, `body='intento C1 staff OK'`. Cleanup posterior: `delete from public.posts where body='intento C1 staff OK'` lo elimina (1 fila devuelta en `returning`). `count(*) where body like 'intento C1%' = 0`.
- [x] `pg_class.relrowsecurity` para `posts` sigue `true` — ok: `relrowsecurity=true, relforcerowsecurity=true` en `public.posts`.
- [x] `npm run lint` exit 0. `npm run build` exit 0 — ok: lint `EXIT=0`, build `EXIT=0` (todas las rutas registradas: `/`, `/activate`, `/api/admin/create-staff`, `/auth/callback`, `/familiar`, `/forgot-password`, `/kids`, `/kids/[id]`, `/login`, `/reset-password`, `/resumen` + Proxy).
- [x] `db-security-auditor` re-corre el test #11 del informe y reporta **APTO** para el fix de C1 — ok: el test #11 del SPEC 20 (`parent zeionsoft INSERT … 'intento C1'`) ahora devuelve `42501` con la nueva policy. Sanity checks (posts_modify_author con filtro role='staff', post_children_modify_author/post_photos_modify_author intactas, relrowsecurity=true, residual=0) verificados por las queries de AC2/AC3/AC5/AC7. Veredicto **APTO**.

## Decisions

- **Sí:** minifix del auditor (añadir `role='staff'` a USING y WITH CHECK de `posts_modify_author`) en lugar de split FOR ALL → UPDATE+DELETE. Razón: una sola policy replacement, mismo patrón textual que `post_children_modify_author` / `post_photos_modify_author` (consistencia), resuelve el bug completo (INSERT + UPDATE + DELETE bloqueados para `role='parent'`). El split solo sería necesario si quisiéramos relajar la regla para UPDATE/DELETE en otra fase (no es el caso).
- **Sí:** mantener `posts_modify_author` como `FOR ALL` y no dividirla. Razón: coherencia con `post_children_modify_author` y `post_photos_modify_author` que también son `FOR ALL` con filtro de rol. Si se divide posts, habría que dividir las otras dos por consistencia — out of scope.
- **No:** tocar `post_children_modify_author` / `post_photos_modify_author`. Razón: la auditoría confirmó que **ya tienen** el filtro `role='staff'` (es inconsistente que `posts_modify_author` no lo tuviera). El fix es solo en `posts`.
- **No:** migrar el seed de SPEC 16 ni tocar archivos de la app (`createPostAction`, `NewPostModal`, `FeedPageClient`, etc.). Razón: la fuga era por SQL directo con `anon`/`publishable` key, no por la UI. La app nunca ofreció a un padre un path para publicar. Sin cambios funcionales necesarios.
- **No:** aplicar el fix automáticamente en el merge del SPEC 20 (hubiera roto el alcance de SPEC 20). Razón: el SPEC 20 marcó `posts_modify_author` como explícitamente fuera de scope ("no se toca"). El fix vive aquí para tener su propia review (PR #33) y mantener el árbol limpio.
- **Sí:** regenerar `types/supabase.ts` aunque la policy no afecte tipos. Razón: el paso queda en el plan por consistencia con SPEC 20 y para confirmar que el diff es 0 (lo que valida que no hay regresión colateral).

## Risks

| Risk | Mitigation |
| --- | --- |
| `posts_modify_author` con `role='staff'` rompe `createPostAction` (SPEC 16) | `createPostAction` se invoca desde Server Actions con sesión staff (JWT `app_metadata.role='staff'`); la policy lo sigue admitiendo. Verificación manual desde la UI (publicar un post desde el composer del staff) en el verify. |
| El fix bloquea `update`/`delete` legítimo de un post propio del staff | El staff sigue siendo el autor de sus posts (`author_id = auth.uid()`); el filtro de rol no afecta. La rama staff del policy no cambia funcionalmente. |
| Drift archivo↔DB por edición manual | Aplicación con `apply_migration`; verificación con `supabase_migrations.schema_migrations.statements[0]` (mismo patrón que en SPEC 20). |
| Si en el futuro se quiere permitir a un padre archivar su propio post (sin staff) | El split FOR ALL → UPDATE/DELETE abriría esa puerta sin tocar INSERT. Documentado como "future spec" en Out of scope. |
| El split FOR ALL genera `multiple_permissive_policies` warnings (auditoría W1 de SPEC 20) | Manteniendo `FOR ALL` y añadiendo el filtro de rol, el warning persiste pero la security_posture mejora. El refactor a UPDATE+DELETE+INSERT separados queda como mejora opcional futura. |

## What is **not** in this spec

- Dividir `posts_modify_author` en `posts_update_author` + `posts_delete_author`.
- Tocar `post_children_modify_author` o `post_photos_modify_author` (ya están correctas).
- Cambios en la UI o en `createPostAction` (la UI nunca ofreció publicar a un padre).
- Cierre de otras policies `FOR ALL` (`daily_summaries_modify_staff_same_daycare`, `children_update_staff_same_daycare`, etc.) — todas tienen el filtro de rol explícito.
- Convertir el proyecto a una capa de "policies un solo comando" (UPDATE/DELETE/INSERT separados por defecto) — fuera de scope.

Cada uno, si llega, va en su propio spec.