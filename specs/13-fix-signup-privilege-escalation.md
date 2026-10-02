# SPEC 13 — Cerrar privilege escalation en signup público (Auth Hook + endpoint admin)

> **Status:** Aprovado
> **Depends on:** SPEC 09 (`users` + enums + `handle_new_auth_user`), SPEC 10 (login real + `getCurrentUser` + claims `app_metadata`), SPEC 11 (`children`), SPEC 12 (vinculación padre↔niño + invitación + `/activate`)
> **Date:** 2026-10-02
> **Objective:** Impedir que cualquier signup público pueda auto-asignarse `role` o `daycare_id` en `auth.users.raw_user_metadata` (vector de privilege escalation identificado por la auditoría `db-security-audit users --apply` el 2026-10-02), sustituyendo el flujo actual por un Auth Hook `before_user_created` que rechaza metadata sensible + un trigger AFTER INSERT en `auth.users` que asigna `daycare_id`/`role` desde invitaciones pendientes + un endpoint admin `/api/admin/create-staff` con `service_role` para altas manuales de staff.

## Why this spec exists

La auditoría de seguridad del 2026-10-02 (`db-security-audit users --apply`) cerró las fugas SQL-actionable de las 6 tablas del DB (migrations 08–12 aplicadas). El derivado **D3** quedó pendiente: el trigger `handle_new_auth_user` (creado en migration 02, propagado en 03) lee `new.raw_user_meta_data ->> 'daycare_id'` y `->> 'role'` para crear el row en `public.users`. Esos campos vienen del cliente (`supabase.auth.signUp({ options: { data: { daycare_id, role } } })`) y son **user-editable**. Cualquier signup público sin verificar puede auto-asignarse `role='admin'` del daycare que quiera, gaining acceso cross-tenant al instante. SPEC 12 (línea 26) reproduce exactamente este patrón en `/activate`.

El SPEC 13 cierra el vector con tres piezas: (1) Auth Hook que rechaza `role`/`daycare_id` en metadata y rechaza signups sin invitación, (2) trigger AFTER INSERT en `auth.users` que mira `invitations` por email y asigna `daycare_id`/`role='parent'`, (3) endpoint admin `/api/admin/create-staff` para altas manuales de staff por un admin del mismo daycare. SPEC 12 se modifica: la action `/activate` deja de mandar `daycare_id`/`role` en metadata.

## Scope

**In:**

- **Auth Hook** `before_user_created` desplegado como Edge Function en `supabase/functions/before_user_created/index.ts` (Deno). Se activa en `supabase/config.toml` con `[auth.hook.before_user_created]` apuntando al slug de la función. Lógica:
  - Lee `event.user.user_metadata` del payload.
  - **Rechaza el signup** (`error.status=400`) si el metadata trae `role` o `daycare_id`. Mensaje en español: "Por seguridad, no se permite asignar rol ni guardería en el signup. Usa una invitación o contacta al administrador."
  - **Rechaza el signup** si no trae `invitation_code` en metadata. Mensaje: "El signup directo está deshabilitado. Usa el enlace de invitación que recibiste por email."
  - Cualquier otro campo en metadata (`full_name`, `avatar_url`, etc.) pasa tal cual al user.
- **Trigger AFTER INSERT** en `auth.users` (`on_auth_user_invitation_assigned`) que, cuando se crea un nuevo `auth.users` con `raw_app_meta_data` sin `daycare_id`/`role`:
  - Busca en `public.invitations` una fila con `email = NEW.email AND status = 'pending' AND expires_at > now()`.
  - Si encuentra, hace `UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('daycare_id', invitation_daycare_id, 'role', 'parent', 'invitation_id', invitation.id)` con `invitation_daycare_id = (SELECT r.daycare_id FROM public.children c JOIN public.rooms r ON r.id = c.room_id WHERE c.id = invitation.child_id)`.
  - El trigger existente `handle_new_auth_user` (migration 02/03) sigue creando el row en `public.users` leyendo de `raw_app_meta_data` (que ya tendrá `daycare_id`/`role` si había invitación). Si no había invitación, el row en `public.users` se crea con `daycare_id=NULL`/`role=NULL` y la action devuelve error de FK violation por el `daycare_id NOT NULL`. Hay que modificar `handle_new_auth_user` para que, si la invitación no asignó nada, use un sentinel: `daycare_id` del único daycare seedeado + `role='pending'`. Detallado en migrations.
- **Modificación del trigger `handle_new_auth_user`** (migration 02/03) en la migration 13: si `raw_app_meta_data ->> 'daycare_id'` es NULL, asigna el `daycare_id` del daycare seedeado (la única guardería actual) y `role='parent'` con `status='pending'`. El padre deberá completar su invitación para vincularse a un niño. Esto es un fallback temporal mientras solo hay 1 daycare; cuando haya multi-daycare (spec aparte) se endurece.
- **Endpoint admin** `/api/admin/create-staff` (Route Handler, `app/api/admin/create-staff/route.ts`) con `service_role`. POST: `{ email, password, full_name, daycare_id, role: 'staff' | 'admin' }`. Valida:
  - Caller autenticado con `getClaims()` (admin role + matching daycare_id del claim con `daycare_id` enviado).
  - `service_role` crea `auth.users` con `raw_user_meta_data = { daycare_id, role: 'staff' | 'admin', full_name }` (server-controlled, no pasa por el hook porque el hook solo se ejecuta en signup público).
  - El trigger `handle_new_auth_user` (con el nuevo fallback) crea el row en `public.users` con `daycare_id` y `role` correctos.
  - Devuelve `{ user_id }` o error en español.
- **Modificación de SPEC 12**: `app/activate/actions.ts` deja de enviar `daycare_id` y `role` en `options.data` del `signUp`. Solo envía `full_name` e `invitation_code`. La asignación post-signup la hace el trigger AFTER INSERT. La fila en `parent_children` y el update de `invitations.status='accepted'` siguen igual (con la sesión del nuevo padre). Validaciones de email/código/contraseña/checkbox sin cambios.
- **Migración** `supabase/migrations/13-fix-signup-privilege-escalation.sql` que aplica los cambios en `handle_new_auth_user` y crea el trigger `on_auth_user_invitation_assigned`. Verificar via MCP que se aplica sin drift y que los triggers coexisten.
- **Regenerar** `types/supabase.ts`.
- **Edge Function deployada** con `supabase_deploy_edge_function` (MCP), con `verify_jwt: false` (el hook no recibe JWT, lo invoca Supabase internamente).
- **Configuración** `supabase/config.toml`: añadir `[auth.hook.before_user_created]` con `uri = "pg-functions://postgres/supabase/functions/before_user_created/before_user_created"`. Documentar.
- **Verificación end-to-end**: role-switch con `signUp` simulado (imposible via SQL, pero se puede verificar el comportamiento del trigger vía INSERT directo en `auth.users` con service_role + JWT claims simulando que el hook YA rechazó la operación), flujo real de `/activate` con un email de prueba, alta de staff via endpoint admin.
- **`npm run lint` y `npm run build`** verdes.

**Out of scope (para specs futuros):**

- Multi-daycare seed (hoy solo hay "Guardería Sala Soles"; SPEC 13 usa su `id` como sentinel en el fallback del trigger). Una spec aparte endurecerá multi-daycare.
- Persistencia del consentimiento de fotos del padre.
- Custom Access Token Hook (distinto al `before_user_created`; inyecta custom claims al JWT en sign-in). Para cuando se introduzcan claims derivados de tablas dinámicas.
- Flujo de aprobación de users en `status='pending'` (admin los activa a `active` manualmente). Una spec de admin panel.
- Recuperación de contraseña, OAuth, magic link, 2FA.
- Reenvío/cancelación programada de invitaciones.

## Edge Function contract

```ts
// supabase/functions/before_user_created/index.ts
type WebhookPayload = {
  user: { id: string; email: string; user_metadata: Record<string, unknown> };
  // otros campos del payload de Supabase Auth Hook
};

type HookResponse =
  | { decision: "approve" }
  | { decision: "reject"; message: string };

Deno.serve(async (req: Request) => {
  const payload: WebhookPayload = await req.json();
  const meta = payload.user.user_metadata ?? {};

  // Regla 1: metadata sensible prohibida
  if ("role" in meta || "daycare_id" in meta) {
    return Response.json({
      decision: "reject",
      message: "Por seguridad, no se permite asignar rol ni guardería en el signup. Usa una invitación o contacta al administrador.",
    } satisfies HookResponse);
  }

  // Regla 2: sin invitation_code no se puede signear
  if (!("invitation_code" in meta) || typeof meta.invitation_code !== "string" || meta.invitation_code.length === 0) {
    return Response.json({
      decision: "reject",
      message: "El signup directo está deshabilitado. Usa el enlace de invitación que recibiste por email.",
    } satisfies HookResponse);
  }

  return Response.json({ decision: "approve" } satisfies HookResponse);
});
```

`deno.json` con `"imports": { "std/": "https://deno.land/std@0.224.0/" }` (plantilla estándar de Supabase Edge Functions).

## Implementation plan

Estructura de archivos (nuevos en **negrita**, modificados marcados):

```
supabase/
  config.toml                              # (mod) + [auth.hook.before_user_created]
  functions/
    before_user_created/
      index.ts                             # (nuevo) Edge Function
      deno.json                            # (nuevo) imports Deno
  migrations/
    13-fix-signup-privilege-escalation.sql # (nuevo) trigger + mod handle_new_auth_user
types/supabase.ts                          # (regenerado)
app/
  api/admin/create-staff/route.ts          # (nuevo) endpoint service_role
  activate/actions.ts                       # (mod) sin daycare_id/role en signUp
```

1. Crear `supabase/functions/before_user_created/deno.json` con los imports estándar. *Funcional: edge function compilable, no desplegada aún.*
2. Crear `supabase/functions/before_user_created/index.ts` con la lógica de rechazo descrita arriba. *Funcional: edge function lista para desplegar.*
3. Modificar `supabase/config.toml`: añadir bloque `[auth.hook.before_user_created]` con `enabled = true`, `uri = "pg-functions://postgres/supabase/functions/before_user_created/before_user_created"`. *Funcional: config lista, no aplicada aún (config.toml se lee en deploy).*
4. Crear `supabase/migrations/13-fix-signup-privilege-escalation.sql` con:
   - DROP + CREATE `handle_new_auth_user` con el fallback cuando `raw_app_meta_data` no trae `daycare_id`/`role` (usa el `daycare_id` del único daycare seedeado + `role='parent'`, `status='pending'`).
   - DROP trigger `on_auth_user_created` y CREATE de nuevo para asegurar uso de la función actualizada (idempotente con `drop trigger if exists` + `create trigger`).
   - CREATE TRIGGER `on_auth_user_invitation_assigned` AFTER INSERT ON `auth.users` FOR EACH ROW EXECUTE FUNCTION `assign_role_from_invitation()`.
   - CREATE OR REPLACE FUNCTION `public.assign_role_from_invitation()` que mira `NEW.email`, busca invitación pending, hace UPDATE de `auth.users.raw_app_meta_data` con los claims.
   - Verificar con `apply_migration` `13_fix_signup_privilege_escalation`. Verificar via MCP que ambos triggers coexisten en `pg_trigger` y que `handle_new_auth_user` tiene el fallback. Drift check. *Funcional: DB lista, sin signup público aún modificado (el hook aún no está activo).*
5. Regenerar `types/supabase.ts` con `supabase_generate_typescript_types`. *Funcional.*
6. Crear `app/api/admin/create-staff/route.ts`:
   - `POST` handler que lee `{ email, password, full_name, daycare_id, role }` del body.
   - Llama a `getClaims()` (helper de SPEC 10) para verificar caller. Si caller no es admin o su `daycare_id` claim no coincide con el `daycare_id` enviado, devuelve 403 con mensaje en español.
   - Llama a `createAdminClient()` (helper con `SUPABASE_SERVICE_ROLE_KEY` server-only) que crea `auth.users` con `admin.createUser({ email, password, email_confirm: true, user_metadata: { daycare_id, role, full_name } })`. El hook `before_user_created` NO se ejecuta aquí (es hook de signup público, no de admin).
   - Devuelve `{ user_id }` o error en español. *Funcional: endpoint listo para probar con curl.*
7. Modificar `app/activate/actions.ts`:
   - En el bloque que hace `signUp`, cambiar `options.data: { daycare_id, role: 'parent', full_name }` por `options.data: { full_name, invitation_code }` (donde `invitation_code = formData.get('code')`).
   - El resto de la action (validaciones, insert parent_children, update invitation status='accepted') sin cambios.
   - El error message del hook `before_user_created` se propaga al cliente si `signUp` falla; mapear `AuthApiError` con mensaje del hook a mensaje en español "El signup fue rechazado por el servidor: <message>". *Funcional: padre con código válido puede signearse, código queda usado.*
7. Desplegar la edge function con `supabase_deploy_edge_function` (MCP): name `before_user_created`, `verify_jwt: false`, files `{ name: "index.ts", content: <contenido del archivo> }, { name: "deno.json", content: <contenido> }`. El hook ya está activo después del deploy. *Funcional: signup público pasa por el hook.*
8. Verificación end-to-end con role-switch + Playwright:
   - Signup directo sin invitation_code → rechazado (hook devuelve reject).
   - Signup con `role='admin'` en metadata → rechazado.
   - Signup con `invitation_code` válido (crear uno en BD antes) → aprobado, trigger AFTER INSERT mira email, encuentra invitación, asigna daycare_id/role. Padre puede logearse y ver `/`.
   - Llamar a `/api/admin/create-staff` con caller staff (no admin) → 403.
   - Llamar a `/api/admin/create-staff` con caller admin de otro daycare → 403.
   - Llamar a `/api/admin/create-staff` con caller admin del mismo daycare → 201, staff creado en BD.
9. `npm run lint` y `npm run build` verdes.
10. Commit + PR en la rama `spec-13-fix-signup-privilege-escalation`.

## Acceptance criteria

- [ ] `supabase/functions/before_user_created/index.ts` y `supabase/functions/before_user_created/deno.json` commiteados; función desplegada vía MCP. *Verificable: `supabase_list_edge_functions` muestra `before_user_created`.*
- [ ] `supabase/config.toml` tiene bloque `[auth.hook.before_user_created]` con `enabled = true`. *Verificable: grep.*
- [ ] Migración `13-fix-signup-privilege-escalation.sql` commiteada y aplicada. `apply_migration` devuelve success. *Verificable: `supabase_list_migrations` muestra `13_fix_signup_privilege_escalation`.*
- [ ] Trigger `on_auth_user_invitation_assigned` existe en `pg_trigger` sobre `auth.users`, AFTER INSERT, ejecuta `assign_role_from_invitation`. *Verificable: query MCP a `pg_trigger`.*
- [ ] Función `public.assign_role_from_invitation()` existe, lenguaje `plpgsql`, SECURITY DEFINER (porque lee `public.invitations` y escribe `auth.users`, ambos necesitan bypass). *Verificable: `pg_proc`.*
- [ ] Función `public.handle_new_auth_user()` modificada: si `raw_app_meta_data ->> 'daycare_id'` es NULL, asigna el `daycare_id` del daycare seedeado + `role='parent'` + `status='pending'`. *Verificable: leyendo el `pg_get_functiondef` o ejecutando con un email sin invitación.*
- [ ] Drift check: `statements[0]` de `13_fix_signup_privilege_escalation` byte-idéntico al archivo (módulo newline).
- [ ] `types/supabase.ts` regenerado incluye tipos de la migration 13 (sin cambios estructurales esperados — solo triggers).
- [ ] `app/api/admin/create-staff/route.ts` commiteado. POST con `{ email, password, full_name, daycare_id, role }` documentado.
- [ ] `app/activate/actions.ts` modificado: `options.data` del `signUp` solo trae `full_name` e `invitation_code`. *Verificable: grep en `pull_signUp.*options.data`.*
- [ ] Signup directo sin `invitation_code` → hook devuelve `decision: reject`. Mensaje exacto: "El signup directo está deshabilitado. Usa el enlace de invitación que recibiste por email." *Verificable: `signUp` en test real devuelve error con ese mensaje.*
- [ ] Signup con `role` o `daycare_id` en metadata → hook devuelve `decision: reject`. Mensaje exacto: "Por seguridad, no se permite asignar rol ni guardería en el signup. Usa una invitación o contacta al administrador." *Verificable: mismo método.*
- [ ] Signup con `invitation_code` válido (existe en `public.invitations` con `status='pending'`, `expires_at > now()`) → hook aprueba, trigger AFTER INSERT mira `auth.users.email`, encuentra la invitación, hace UPDATE de `raw_app_meta_data` con `daycare_id` + `role='parent'`. El padre puede logearse y su JWT tiene los claims correctos. *Verificable: end-to-end con email de prueba en Resend.*
- [ ] Signup con `invitation_code` inválido → hook aprueba (no valida el código), trigger no asigna claims, `handle_new_auth_user` usa el fallback (daycare seedeado + role='parent' + status='pending'). El padre queda en estado pending. *Verificable: el padre puede logearse pero el feed está vacío y su `public.users.status='pending'`.*
- [ ] `/api/admin/create-staff` con caller que NO es admin → 403. *Verificable: con JWT de role='staff', POST devuelve 403.*
- [ ] `/api/admin/create-staff` con caller admin de OTRO daycare (claim `daycare_id` distinto al enviado en body) → 403. *Verificable: similar.*
- [ ] `/api/admin/create-staff` con caller admin del mismo daycare → 201, devuelve `{ user_id }`. El row en `auth.users` tiene `raw_app_metadata` con `daycare_id`/`role` correctos, `public.users` se crea vía trigger con esos claims. *Verificable: query MCP tras la llamada.*
- [ ] `npm run lint` y `npm run build` pasan sin errores.
- [ ] Regresión: SPEC 12 (flujo `/activate` end-to-end con invitación válida) sigue funcionando — el padre se signea, queda vinculado al niño, ve el feed. La fila `parent_children` se crea con `relationship` de la invitación. `invitations.status='accepted'` con `accepted_at`. *Verificable: Playwright + queries MCP.*
- [ ] Regresión: SPEC 10 (login con `staff@opendaycare.com`) sigue funcionando. El staff existente (Alberto) tiene sus claims correctos. *Verificable: login + queries MCP.*
- [ ] Consola del navegador sin errores durante el flujo completo (signup con invitación → login → feed).

## Decisions

- **Sí:** Auth Hook `before_user_created` (no `custom_access_token_hook`). El primero valida el momento del signup; el segundo inyecta claims al JWT en sign-in. Para nuestro caso, validar en signup es suficiente y más simple.
- **Sí:** hook rechaza `role` y `daycare_id` específicamente (no whitelist). Cualquier otro campo (`full_name`, `avatar_url`) pasa.
- **Sí:** hook también rechaza si no hay `invitation_code`. Cierra el signup directo completamente.
- **Sí:** trigger AFTER INSERT en `auth.users` (no en `public.users`). Más cerca del origen de los datos; `auth.users` es donde viven los claims que `handle_new_auth_user` propaga a `public.users`.
- **Sí:** fallback en `handle_new_auth_user` para signups con invitation_code inválido: usa el único daycare seedeado + `role='parent'` + `status='pending'`. El padre queda pendiente hasta que un staff/admin lo apruebe. Aceptable mientras solo hay 1 daycare; cuando haya multi-daycare, el fallback se endurece (probablemente rechaza el signup en lugar de asignar a un daycare default).
- **Sí:** endpoint admin `/api/admin/create-staff` con autorización `role='admin'` + matching `daycare_id` del claim. Verificación server-side via `getClaims()`.
- **Sí:** el endpoint admin crea el `auth.users` via `supabase.auth.admin.createUser` (no `signUp`), por lo que el hook `before_user_created` NO se ejecuta en esta vía. El admin es server-controlled.
- **Sí:** SPEC 12 se modifica en `app/activate/actions.ts` quitando `daycare_id`/`role` del `options.data` del signUp. La asignación la hace el nuevo trigger. El padre no ve ningún cambio en la UX.
- **No:** deshabilitar el signup público en `config.toml` o Dashboard. El hook ya lo cierra con la regla de `invitation_code`. Mantener el flag default de Supabase para no añadir fricción de provisioning.
- **No:** agregar una columna `status='pending'` al signup directo (no se rechaza, queda en pending). El hook rechaza directamente.
- **No:** migrar SPEC 12. El SPEC 13 la deja como módulo; las decisiones de SPEC 12 se mantienen. Si en el futuro hay que referenciar este cambio, se hace en SPEC 12 con un addendum en la sección de "Decisions".

## Risks

| Risk | Mitigation |
| --- | --- |
| Edge function no se invoca (config.toml mal configurado, deploy falla, etc.) → el signup queda sin validar | Acceptance criterion `HTTP-403` en signup con metadata sensible verifica que el hook se ejecuta. Si el hook no responde, Supabase Auth bloquea el signup por timeout (default 2s). |
| Trigger AFTER INSERT en `auth.users` falla → user queda sin claims, login falla | El trigger hace `UPDATE auth.users` que podría fallar por FK violation o permisos. Se envuelve en `EXCEPTION WHEN OTHERS THEN ... RAISE WARNING` para no bloquear el INSERT padre. Si falla, el user queda con fallback del trigger `handle_new_auth_user` (daycare seedeado + role='pending'). |
| El fallback "daycare seedeado" deja a todos los padres sin invitación válida apuntando al mismo daycare | Aceptable a corto plazo (1 daycare seedeada). Cuando haya multi-daycare, el fallback se endurece. Documentado en out-of-scope. |
| `/api/admin/create-staff` no verifica que el email no exista ya → 500 con error genérico de Supabase | Validar con `auth.admin.listUsers({ filter: email })` antes de crear. Si existe, devolver 409 "Este email ya tiene una cuenta." |
| Modificación de `handle_new_auth_user` rompe el seed de migration 02 (Alberto Sánchez con `role='staff'`) | El seed se ejecutó antes del cambio; el row ya existe en `public.users`. El trigger solo aplica a nuevos INSERTs. Verificar con query MCP que Alberto y Alberto Sánchez siguen con su `role` original. |
| El hook rechaza el signup del staff seed cuando Supabase Auth intenta recrearlo | El staff seed se crea vía `insert into auth.users` directo (no signUp), por lo que el hook no se ejecuta. Verificar que el seed sigue funcionando. |
| SPEC 12 activado antes de SPEC 13: `/activate` envía `daycare_id`/`role` y el hook los rechaza | El deploy de la migration 13 y el de la edge function van en la misma pasada del PR. Si hay un PR intermedio, SPEC 13 está roto. Orden en el implementation plan: edge function + config.toml + migration + action `/activate` todo en el mismo commit. |

## What is **not** in this spec

- Multi-daycare seed + hardening del fallback de `handle_new_auth_user`.
- Custom Access Token Hook (claims derivados al JWT en sign-in).
- Flujo de aprobación de users en `status='pending'` (admin los activa a `active`).
- Endpoint admin para crear parent (no staff). La creación de parent se hace via invitación (SPEC 12). Solo staff requiere alta manual.
- Resend de invitaciones, panel de gestión de invitaciones.
- Recuperación de contraseña, OAuth, magic link, 2FA.
- Tests automatizados del hook (e.g., suite de unit tests en `supabase/functions/before_user_created/`). El flujo se verifica end-to-end con role-switch + Playwright; tests unitarios son nice-to-have.

Cada una de esas, si llega, va en su propio spec.