# SPEC 12 — Vinculación real padre↔niño: invitación + email Resend + activación

> **Status:** Aprobado
> **Depends on:** SPEC 05 (LinkParentModal), SPEC 09 (`users` + trigger + enums), SPEC 10 (login real, claims `daycare_id`/`role`, `getCurrentUser`), SPEC 11 (`children` reales, Server Actions en `/kids`)
> **Date:** 2026-09-27
> **Objective:** Convertir "Vincular padre" en real: el modal crea una invitación en BD (migraciones `parent_children` + `invitations`), envía un correo con código vía Resend desde Next.js, y `/activate` valida el código y registra al padre como usuario `parent` vinculado al niño.

## Why this spec exists

SPEC 05 dejó la vinculación en memoria y SPEC 11 lo declaró explícitamente out of scope ("`parent_children`, `invitations` ni Vincular real"). Este spec cierra ese hueco y conecta los tres dominios que ya existen: el perfil de niños (SPEC 11), Supabase Auth con trigger de dominio (SPEC 09/10) y el flujo de activación maqueta (SPEC 03). Es la primera vez que la app envía un email: se usa el paquete `resend` server-side desde Server Actions.

**Prerequisito manual (fuera del código):** desactivar "Confirm email" en Dashboard → Authentication → Sign In / Up. El código de invitación ya demuestra que el email es real (llegó al buzón del padre); con confirmación activada el padre recibiría un segundo correo de Supabase y no podría entrar.

## Scope

**In:**

- Migración `supabase/migrations/06-create_parent_children.sql`: enum `relationship_type` (`mother`/`father`/`guardian`), tabla `parent_children` con UNIQUE (`parent_id`,`child_id`), índice `parent_children_child_id_idx`, RLS on + 4 policies `authenticated` (patrón abierto, coherente con SPEC 08–11).
- Migración `supabase/migrations/07-create_invitations.sql`: enum `invitation_status` (`pending`/`accepted`/`expired`/`cancelled`), tabla `invitations` (código `UNIQUE`, `expires_at` default `now() + 7 days`), índices, RLS on + 4 policies `authenticated`, y función `public.email_exists(text)` SECURITY DEFINER (revocada a `anon`, ejecutable por `authenticated`) para comprobar si un email ya está registrado sin exponer `auth.users` ni usar `service_role`.
- Paquete `resend` (`npm i resend`) + variable `RESEND_API_KEY` en `.env.local`. Helper server-only `utils/email.ts` con `sendInvitationEmail({ to, parentName, childName, code, activateUrl })`: from `onboarding@resend.dev` (sandbox), asunto "Tu invitación a OpenDayCare", cuerpo HTML con el código en grande, "Vence en 7 días" y botón "Activar mi cuenta" → `${origin}/activate?code=<CODE>` (origin derivado de `headers()`).
- Server Action `inviteParent(prevState, formData)` en `app/kids/actions.ts` (junto a `addKid`): valida nombre/email/parentesco; rechaza si `email_exists` → "Este email ya tiene una cuenta. Pídele que inicie sesión."; rechaza si ya hay invitación `pending` para el mismo email+niño → "Ya existe una invitación pendiente para este email."; genera código de 5 chars `[A-Z0-9]` (retry hasta 3 ante colisión UNIQUE); inserta `invitations` (`invited_by` = staff de sesión vía `getClaims()`, `child_id` de la página, `relationship` mapeado); envía el email; **si el envío falla, elimina la invitation y devuelve error**; `revalidatePath('/kids/[id]')`.
- `LinkParentModal`: elimina la caja "CÓDIGO DE INVITACIÓN" y la generación client-side (deviación de la maqueta, acordada); el submit pasa a `useActionState(inviteParent)`; errores inline bajo el CTA (además de los de validación local); en éxito cierra el modal y el perfil muestra la invitación como PENDIENTE desde BD.
- Perfil `/kids/[id]` con "Padres vinculados" **real**: `app/kids/[id]/page.tsx` consulta `parent_children` JOIN `users` (ACTIVA) + `invitations` `pending` no expiradas (PENDIENTE, nota "invitación enviada") y construye `Parent[]`; `ProfileClient` deja de mutar state en memoria (recibe `parents` por props; el orden es activos primero, luego pendientes por `created_at`).
- Mapeo `relationship` inglés↔UI español (`mother`→"Mamá", `father`→"Papá", `guardian`→"Tutor/a") en `mapKid.ts`.
- `parentsCount` real en `/kids`: el page fetch cuenta `parent_children` por niño; `KidCard` muestra VINCULAR solo con 0 vínculos activos.
- `/activate` real: `app/activate/actions.ts` con `activate(prevState, formData)`; la página deja de precargar mocks (código `7K4P9`, email, contraseña) y pre-rellena el campo código desde `?code=`; valida código/email/contraseña (≥ 8 chars) y checkbox de fotos **requerido para enviar** (UI-only, no persiste — no hay columna para el consentimiento del padre); marca `expired` si `expires_at < now()`; `supabase.auth.signUp({ email, password, options.data: { daycare_id (invitation→children→rooms→daycares), role: 'parent', full_name } })` (el trigger de SPEC 09/10 crea `public.users` + claims); tras el signUp, con el cliente ya autenticado como el nuevo padre: inserta `parent_children` (`relationship` de la invitación) y actualiza la `invitations` a `status='accepted'`, `accepted_at=now()`; errores en español mapeados ("Código de invitación inválido", "Esta invitación ya fue utilizada", "El email no coincide con la invitación", "El código ha expirado", "Este email ya tiene una cuenta. Inicia sesión."); en éxito muestra mensaje de confirmación con link "Iniciar sesión" → `/login` (sin auto-login, acordado).
- Regenerar `types/supabase.ts`. `npm run lint` y `npm run build` en verde.

**Out of scope (para specs futuros):**

- Feed de familia (`familia-feed.dc.html`) y filtrado de publicaciones por padre (`post_children`); el padre recién creado verá el feed actual hasta que llegue ese spec.
- Reenvío/cancelación/expiración programada de invitaciones (el `expired` se marca de forma lazy al activar; no hay cron).
- Panel de gestión de invitaciones, edición/baja de padres vinculados.
- Persistencia del consentimiento de fotos del padre (no hay columna; el checkbox es gate de UI).
- Dominio verificado en Resend / plantillas con branding / emails de bienvenida.
- RLS multi-tenant estricta (claims `daycare_id` en policies) y Custom Access Token Hook.
- Recuperación de contraseña y "¿Ya tienes cuenta?" más allá del link a `/login`.

## Data model

`supabase/migrations/06-create_parent_children.sql`:

```sql
create extension if not exists pgcrypto schema extensions;

create type public.relationship_type as enum ('mother', 'father', 'guardian');

create table public.parent_children (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references public.users(id) on delete cascade,
  child_id     uuid not null references public.children(id) on delete cascade,
  relationship public.relationship_type not null,
  created_at   timestamptz not null default now(),
  constraint parent_children_parent_child_key unique (parent_id, child_id)
);

create index parent_children_child_id_idx on public.parent_children(child_id);

alter table public.parent_children enable row level security;

create policy "parent_children_select_authenticated" on public.parent_children for select to authenticated using (true);
create policy "parent_children_insert_authenticated" on public.parent_children for insert to authenticated with check (true);
create policy "parent_children_update_authenticated" on public.parent_children for update to authenticated using (true) with check (true);
create policy "parent_children_delete_authenticated" on public.parent_children for delete to authenticated using (true);
```

`supabase/migrations/07-create_invitations.sql`:

```sql
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'cancelled');

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references public.children(id) on delete cascade,
  invited_by   uuid not null references public.users(id) on delete restrict,
  full_name    text not null,
  email        text not null,
  relationship public.relationship_type not null,
  code         text not null unique,
  status       public.invitation_status not null default 'pending',
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index invitations_child_id_idx on public.invitations(child_id);
create index invitations_email_idx    on public.invitations(email);

alter table public.invitations enable row level security;

create policy "invitations_select_authenticated" on public.invitations for select to authenticated using (true);
create policy "invitations_insert_authenticated" on public.invitations for insert to authenticated with check (true);
create policy "invitations_update_authenticated" on public.invitations for update to authenticated using (true) with check (true);
create policy "invitations_delete_authenticated" on public.invitations for delete to authenticated using (true);

-- Chequeo de registro previo sin exponer auth.users ni usar service_role.
create function public.email_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email));
$$;

revoke execute on function public.email_exists(text) from anon;
grant execute on function public.email_exists(text) to authenticated;
```

Convenciones y tipos de UI:

- Enums en inglés; la UI traduce (SPEC 06): `mother`↔"Mamá", `father`→"Papá", `guardian`↔"Tutor/a".
- `code`: 5 caracteres `[A-Z0-9]`, generado server-side, `UNIQUE` con retry ≤ 3.
- `relationship_type` vive en la migración 06 y `invitations` lo reutiliza (07 depende de 06).
- El tipo `Parent` de `mockKids.ts` se conserva como tipo de UI sin cambios; `status: "activa"` ahora viene de `parent_children` y `"pendiente"` de `invitations` pending.
- `invited_by ... on delete restrict`: borrar el staff no debe borrar el historial de invitaciones silenciosamente.

## Implementation plan

Estructura de archivos (nuevos en negrita, modificados marcados):

```
supabase/migrations/
  06-create_parent_children.sql      # (nuevo)
  07-create_invitations.sql          # (nuevo)
types/supabase.ts                    # (regenerado)
package.json / package-lock.json     # (mod) + resend
.env.local                           # (mod, no versionado) + RESEND_API_KEY
utils/
  email.ts                           # (nuevo) sendInvitationEmail (server-only)
components/kids/
  LinkParentModal.tsx                # (mod) sin caja código + useActionState
  mapKid.ts                          # (mod) mapeo relationship ↔ español
app/kids/
  actions.ts                         # (mod) inviteParent
  page.tsx                           # (mod) conteo parent_children por niño
  [id]/page.tsx                      # (mod) fetch padres reales + pendientes
  [id]/ProfileClient.tsx             # (mod) sin mutación en memoria
app/activate/
  actions.ts                         # (nuevo) activate
  ActivateForm.tsx                   # (mod) sin mocks prefill, ?code=, useActionState
  page.tsx                           # (mod) pasar searchParams.code
```

1. Crear `06-create_parent_children.sql` y aplicar con `apply_migration` (`06_create_parent_children`). Verificar vía MCP: enum, tabla, UNIQUE, índice, RLS on, 4 policies, 0 filas. *Funcional: BD lista, app intacta.*
2. Crear `07-create_invitations.sql` y aplicar (`07_create_invitations`). Verificar: enum, tabla, `code UNIQUE`, índices, RLS, 4 policies, `email_exists('staff@opendaycare.com')` = true y `email_exists('nadie@xyz.com')` = false (ejecutado como `authenticated` vía role-switch; como `anon` → permission denied). Drift check en ambas. *Funcional.*
3. Regenerar `types/supabase.ts` con `supabase_generate_typescript_types`. *Funcional.*
4. `npm i resend`; documentar `RESEND_API_KEY` en `.env.local` (la añade el usuario). Crear `utils/email.ts` con `sendInvitationEmail` (clase `Resend` con `process.env.RESEND_API_KEY`, from `onboarding@resend.dev`, HTML con botón `${activateUrl}`). *Funcional: no hay usos aún; build verde (el helper no se ejecuta en build).*
5. `app/kids/actions.ts`: añadir `inviteParent(prevState, formData)` — valida (mismas reglas de SPEC 05), `email_exists`, duplicado pending, código con retry, insert `invitations` (con `invited_by` de `getClaims().claims.sub`), `sendInvitationEmail`, rollback del insert si el envío falla, `revalidatePath('/kids/[id]')`. *Funcional: accionable aunque la UI aún no lo use.*
6. `LinkParentModal.tsx`: quitar caja de código y `generateInviteCode`; `useActionState(inviteParent)`; errores de acción inline bajo el CTA (además de los de validación local); en éxito `onClose()` y reset (remount, patrón de SPEC 11). Recibe `childId` por props. *Funcional: invitar desde el perfil crea fila real.*
7. `app/kids/[id]/page.tsx` + `ProfileClient.tsx`: fetch real de `Parent[]` (join `parent_children`+`users`, más `invitations` pending `expires_at > now()`), avatares con hash de uuid (paleta existente), `ProfileClient` sin `setParents`. *Funcional: lista persiste entre recargas.*
8. `mapKid.ts`: `relationshipToSpanish` / `spanishToRelationship`; `app/kids/page.tsx` cuenta `parent_children` por niño y `KidCard` usa `parentsCount` real. *Funcional: badge VINCULAR correcto.*
9. `app/activate/actions.ts` con `activate`: validaciones + `signUp` + insert `parent_children` + update `invitations` a `accepted`; mensajes en español. *Funcional.*
10. `app/activate/page.tsx` + `ActivateForm.tsx`: quitar prefill mock; `searchParams.code` → campo código; `useActionState(activate)`; checkbox requerido; éxito → bloque de confirmación con link "Iniciar sesión" a `/login`. *Funcional: flujo completo end-to-end.*
11. `npm run lint` y `npm run build` verdes. Verificación Playwright completa (invitación real, activación, login del padre) + queries MCP. *Funcional.*
12. Commit + PR en la rama `spec-12-parent-invitation-and-activation`.

## Acceptance criteria

- [ ] Existen `supabase/migrations/06-create_parent_children.sql` y `07-create_invitations.sql` commiteados.
- [ ] `apply_migration` `06_create_parent_children` y `07_create_invitations` devuelven success; vía MCP: enums `relationship_type` (3 valores) e `invitation_status` (4 valores), tablas con RLS on y 4 policies `authenticated` cada una, UNIQUE (`parent_id`,`child_id`), `code` UNIQUE, índices `parent_children_child_id_idx`/`invitations_child_id_idx`/`invitations_email_idx`; 0 filas; sin drift con los archivos.
- [ ] `email_exists` devuelve `true` para `staff@opendaycare.com` y `false` para un email inexistente (rol `authenticated`); `anon` obtiene permission denied.
- [ ] `types/supabase.ts` incluye `parent_children` e `invitations`.
- [ ] `npm run lint` y `npm run build` pasan sin errores.
- [ ] Con sesión staff, invitar "Diego Fernández / diego@test.com / Papá" desde `/kids/<uuid>`: modal se cierra, y vía MCP la `invitations` tiene `code` de 5 chars `[A-Z0-9]`, `status='pending'`, `expires_at ≈ now()+7d`, `relationship='father'`, `invited_by` = uuid del staff, `child_id` = el de la página.
- [ ] Tras invitar, "Padres vinculados" muestra a Diego como PENDIENTE ("invitación enviada") **y sobrevive a recarga** (ya no es state en memoria).
- [ ] Reinvitar el mismo email pendiente al mismo niño → error inline "Ya existe una invitación pendiente para este email." y no se crea segunda fila.
- [ ] Invitar con `staff@opendaycare.com` (email ya registrado) → error inline "Este email ya tiene una cuenta. Pídele que inicie sesión." sin crear fila.
- [ ] El email llega (sandbox: a un email registrado en la cuenta Resend) desde `onboarding@resend.dev` con código visible y botón que abre `/activate?code=<CODE>`.
- [ ] Sin `RESEND_API_KEY` o con envío fallido: error inline "No se pudo enviar el correo. Intenta de nuevo." y **no queda invitation huérfana** (rollback verificado vía MCP: 0 filas).
- [ ] `/activate` abre sin valores mock precargados; con `?code=XXXXX` el campo código viene pre-relleno.
- [ ] Activar con código inexistente → "Código de invitación inválido."; con `status='accepted'` → "Esta invitación ya fue utilizada."; con email que no coincide → "El email no coincide con la invitación."; contraseña < 8 → error inline; checkbox desmarcado → no envía.
- [ ] Activación válida (email de prueba registrado en Resend): crea `auth.users` con `raw_user_meta_data` `{daycare_id, role:'parent', full_name}` (verificado vía MCP), `public.users` con `role='parent'` y `status='active'` (trigger), `parent_children` con el `relationship` de la invitación, `invitations.status='accepted'` con `accepted_at`.
- [ ] Tras la activación aparece el mensaje de éxito con link "Iniciar sesión"; con esas credenciales (email+contraseña) el login funciona y llega a `/`.
- [ ] Invitation con `expires_at` en el pasado (modificada vía MCP) → al activar: "El código ha expirado." y `status` pasa a `expired`.
- [ ] Los badges de `/kids`: un niño con invitación pendiente y sin vínculo activo sigue mostrando VINCULAR (solo cuenta `parent_children`); tras activar, el badge desaparece y `parentsCount` = 1.
- [ ] Regresión: alta de niños (SPEC 11), feed y chips PARA (SPEC 11), login/logout staff (SPEC 10), apertura/cierre/validaciones del modal (SPEC 05) siguen funcionando; `/` sin sesión → `/login?next=/`.
- [ ] Consola del navegador sin errores durante el flujo completo (invitar → recargar perfil → activar → login padre).

## Decisions

- **Sí:** un solo spec para invitación + email + activación (acordado): el flujo no es entregable por partes; las migraciones se separan igual (06 y 07).
- **Sí:** "Padres vinculados" desde BD real, eliminando el mock en memoria de SPEC 05 (acordado).
- **Sí:** código generado server-side al enviar; el modal pierde la caja "CÓDIGO DE INVITACIÓN" (acordado; desviación de la maqueta justificada — el código viaja solo por email).
- **Sí:** Resend desde Next.js (Server Action) con paquete `resend` y `onboarding@resend.dev` (acordado). **No:** Edge Function de envío — el modal ya es Server Action y la API key no debe bajar al cliente.
- **Sí:** `email_exists()` SECURITY DEFINER para el rechazo de duplicados en la invitación. **No:** usar `service_role` en el servidor para `admin.getUserByEmail` — añade un secreto sin necesidad; la función es auditable y `revoked from anon`.
- **Sí (prerequisito manual):** desactivar "Confirm email" en el Dashboard (acordado). El código de invitación es la prueba de posesión del email.
- **Sí:** tras activar, mensaje + link a `/login`, sin auto-login (acordado). **No:** redirigir a `/` con sesión de padre — el feed de familia no existe aún y sería confuso.
- **Sí:** deep-link `/activate?code=` con prefill (acordado). Se eliminan los valores mock de SPEC 03 de esa página.
- **Sí:** si el envío del email falla, se elimina la invitation (rollback): mejor reintentar la invitación que un código muerto en BD.
- **Sí:** expiración lazy — `expired` se marca al intentar activar. **No:** pg_cron: no hay caso de uso visible hasta que exista panel de invitaciones.
- **Sí:** checkbox de consentimiento obligatorio para activar pero **no persistido**: no existe columna para consentimiento del padre en el esquema objetivo; si se necesita, su propia migración.
- **Sí:** `parentsCount` (badge VINCULAR) cuenta solo vínculos activos: una invitación pendiente no debe ocultar el CTA.
- **Sí:** inserción de `parent_children` y update de `invitations` post-signUp con el cliente de la acción (supabase-js ya porta la sesión del nuevo padre tras `signUp` con confirm desactivada → policies `authenticated` aplican). Sin RPC `security definer` adicional para esto.
- **Sí:** enums e identificadores en inglés con traducción UI, RLS abierta a `authenticated` y `invited_by on delete restrict` (convenciones AGENTS/SPEC 09–11).

## Risks

| Risk | Mitigation |
| --- | --- |
| `signUp` OK pero falla el insert `parent_children`/update invitation → padre creado sin vínculo (estado parcial) | Los tres pasos van en la misma acción; el insert/update usa la sesión recién creada. Si falla, la acción devuelve error en español y el staff puede re-invitar (la invitation sigue `pending`; `email_exists` bloquearía re-registro, y el vínculo se puede restaurar manualmente — se documenta como límite aceptado). |
| Sandbox de Resend solo entrega a emails registrados en la cuenta | Criterio de aceptación usa un email propio; para producción basta cambiar el `from` (una línea en `utils/email.ts`) cuando haya dominio verificado. |
| Si "Confirm email" no está desactivado, `signUp` no devuelve sesión y el link/post-update falla | Prerequisito explícito en el spec + primer paso de verificación end-to-end (activar una invitation desechable antes que nada). |
| `email_exists` revela existencia de cuentas a cualquier `authenticated` (enumeración) | Aceptable a corto plazo: el execute está limitado a `authenticated` (solo staff usa el modal hoy) y el flujo es inverso (el staff ya conoce a las familias). Se revisa con el endurecimiento multi-tenant. |
| Colisión de `code` (5 chars, 36^5 ≈ 60M) | UNIQUE + retry ≤ 3; probabilidad despreciable al volumen de una guardería. |
| El padre recién activado entra a `/` y ve datos de staff (RLS abierta, feed sin filtrar) | Heredado de SPEC 10/11; el filtrado por `post_children` llega con el spec de familia-feed. Registrado como riesgo conocido. |
| Cambios en `LinkParentModal`/`ProfileClient` rompen regresiones de SPEC 05/11 | Criterios de regresión explícitos (validaciones inline, apertura/cierre, badge VINCULAR); un solo call site cada uno. |

## What is **not** in this spec

- Feed de familia ni filtrado del feed por padre (`post_children`).
- Reenvío, cancelación o expiración programada de invitaciones; panel de gestión de invitaciones.
- Edición/baja de padres vinculados.
- Persistencia del consentimiento de fotos; Storage/fotos reales.
- Dominio Resend verificado, plantillas branding, email de bienvenida al padre.
- RLS multi-tenant (claims `daycare_id`) y Custom Access Token Hook.
- Recuperación de contraseña, OAuth, magic link, 2FA.

Cada una de esas, si llega, va en su propio spec.
