# SPEC 15 — Password recovery vía email + remitente Resend configurable

> **Status:** Aprobado
> **Depends on:** SPEC 10 (login real), SPEC 13/14 (Auth Hook hardening)
> **Date:** 2026-10-03
> **Objective:** Implementar recuperación de contraseña vía Supabase Auth (`/forgot-password` → email link → `/reset-password`) y hacer configurable el remitente de Resend para que cualquier destinatario funcione una vez verificado un dominio propio.

## Why this spec exists

Dos brechas conectadas:

1. La pantalla de login ya muestra "¿Olvidaste tu contraseña?" (`app/login/LoginForm.tsx:86–90`) pero es un `<span>` estático sin destino. SPEC 12 lo dejó explícitamente fuera ("Recuperación de contraseña y '¿Ya tienes cuenta?' más allá del link a `/login`"). Este spec lo cierra.

2. Resend está hardcodeado a `from: "onboarding@resend.dev"` en `utils/email.ts:3`, y el sandbox solo entrega al email dueño de la cuenta Resend (403 verificado en SPEC 12 línea 166). El operador quiere migrar a un dominio verificado cuando esté listo; esta spec deja el `from` en env-var (`RESEND_FROM`) con fallback al sandbox.

Ambas piezas entran en el mismo spec porque la recuperación por Supabase Auth **no** usa Resend (usa el SMTP del Dashboard) — pero el helper de invitaciones (SPEC 12) sí usa Resend y queda desbloqueado por la env-var.

## Scope

**In:**

- **Forgot password** `app/forgot-password/{page,ForgotPasswordForm,actions}.tsx`: server component que redirige si ya hay sesión + client form con `useActionState` + Server Action `requestPasswordReset` que llama `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/auth/callback?next=/reset-password })` (origin derivado de `headers()`) → mensaje neutro "Si existe una cuenta con ese email, te enviamos un enlace para restablecer tu contraseña." (anti-enumeración).
- **Auth callback** `app/auth/callback/route.ts`: GET que lee `?code=&next=&type=`, llama `supabase.auth.exchangeCodeForSession(code)` con `await cookies()`, redirige a `next` (`/reset-password`); si falla → `/login?error=auth_callback_failed` o `/login?error=recovery_link_invalid` según el caso.
- **Reset password** `app/reset-password/{page,ResetPasswordForm,actions}.tsx`: server component que verifica `getClaims()` y que la sesión esté en modo recovery (en otro caso → `/login?error=recovery_session_expired` o `/`); form con password + confirm (≥ 8 chars, coinciden); Server Action llama `supabase.auth.updateUser({ password })`, en éxito hace `signOut()` + limpia cookies (mismo patrón que SPEC 12 `authCookieNames`) + redirect a `/login?reset=ok`.
- **Banner de éxito en `/login`**: si `?reset=ok` → banner pequeño "Tu contraseña fue actualizada. Inicia sesión."
- **LoginForm**: el `<span>` se vuelve `<Link href="/forgot-password">` con las mismas clases CSS.
- **Resend env-driven**: `utils/email.ts:3` cambia de `const RESEND_FROM = "onboarding@resend.dev";` a `const RESEND_FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";`.
- **`.env.template`**: añadir `RESEND_FROM=onboarding@resend.dev` con comment "Override with `noreply@yourdomain.com` after verifying a domain at https://resend.com/domains".
- **README**: nueva sección "Resend domain verification (recommended for production)" con 3 pasos: (1) añadir dominio en resend.com/domains, (2) configurar DNS records, (3) `RESEND_FROM=noreply@yourdomain.com` en `.env.local`.
- **`npm run lint` + `npm run build` verdes.**

**Out of scope (para specs futuras):**

- Custom branded recovery email (Supabase Dashboard tiene editor HTML).
- Magic links, OAuth, 2FA, SMS recovery.
- Rate limiting custom (Supabase ya lo aplica).
- Self-serve Resend domain verification automation (DNS es responsabilidad del operador).
- "Remember me" / extended sessions.
- Audit log app-side de recovery (`auth.audit_log_entries` ya existe en Supabase).
- Multi-language recovery email template.

## Data model

Sin nuevas tablas. Auth state vive en `auth.users.encrypted_recovery_token` y `auth.audit_log_entries` (internos de Supabase).

Una env var nueva:

```env
RESEND_FROM=onboarding@resend.dev   # override with noreply@yourdomain.com after verifying a domain
```

## Implementation plan

1. **Modificar `utils/email.ts:3`** → `const RESEND_FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";`. *Funcional: build verde; invitaciones siguen yendo desde sandbox hasta que se setee la env var.*
2. **Modificar `.env.template`** → añadir `RESEND_FROM=` con comment. *Funcional.*
3. **Modificar `README.md`** → nueva sección "Resend domain verification (recommended for production)" con 3 pasos numerados. *Funcional.*
4. **Crear `app/forgot-password/`**: page (server, redirige si hay sesión), `ForgotPasswordForm.tsx` (client, mismo gradiente terracota del login), `actions.ts` (server, `requestPasswordReset` con `headers().get('origin')` para el `redirectTo`). *Funcional: form accionable aunque no haya email real aún.*
5. **Crear `app/auth/callback/route.ts`** (GET) que intercambia code por sesión y redirige. *Funcional: puente entre el link del email y `/reset-password`.*
6. **Crear `app/reset-password/`**: page (server, valida sesión de recovery), `ResetPasswordForm.tsx` (client), `actions.ts` (server, `updatePassword` con `signOut` + clear cookies en éxito). *Funcional.*
7. **Modificar `app/login/LoginForm.tsx`**: el `<span>¿Olvidaste tu contraseña?</span>` → `<Link href="/forgot-password" className="...">¿Olvidaste tu contraseña?</Link>` (mismas clases). *Funcional: navegación a la nueva pantalla.*
8. **Banner `?reset=ok` en `/login`**: en `LoginForm.tsx`, si `searchParams` tiene `reset=ok`, mostrar banner discreto arriba del form. (Requiere pasar el flag como prop desde `page.tsx`.)
9. **Verificación**: `npm run lint` + `npm run build`. Test manual: pedir reset → recibir email (Supabase SMTP custom o falla esperada) → click → setear nueva password → login con la nueva funciona.
10. **Commit + PR** en rama `spec-15-password-recovery-and-resend-sender`.

## Acceptance criteria

- [ ] `utils/email.ts` lee `RESEND_FROM` de `process.env` con fallback a `"onboarding@resend.dev"`.
- [ ] `.env.template` y `README.md` documentan la env var y los 3 pasos para verificar dominio en Resend.
- [ ] `/forgot-password` carga como server component; sesión activa → redirect a `/`.
- [ ] Submit del form con email vacío → "Introduce un email válido." inline.
- [ ] Submit del form con email válido (exista o no) → muestra mensaje neutro "Si existe una cuenta con ese email, te enviamos un enlace…" (anti-enumeración).
- [ ] Server Action llama `resetPasswordForEmail` con `redirectTo = ${origin}/auth/callback?next=/reset-password` (origin de `headers()`).
- [ ] El email que llega contiene link a `${origin}/auth/callback?code=...&type=recovery&next=/reset-password`.
- [ ] `app/auth/callback/route.ts` intercambia el code con `supabase.auth.exchangeCodeForSession(code)` y `await cookies()`; redirige a `next`; si falla → `/login?error=auth_callback_failed`.
- [ ] `/reset-password` solo carga si la sesión es de recovery; en otro caso → redirect a `/login?error=recovery_session_expired` o `/`.
- [ ] Form con password < 8 → error inline "La contraseña debe tener al menos 8 caracteres."
- [ ] Form con password ≠ confirm → error inline "Las contraseñas no coinciden."
- [ ] Submit válido → `updateUser({ password })`; en éxito → `signOut()` + clear cookies + redirect a `/login?reset=ok`.
- [ ] `/login?reset=ok` muestra banner discreto "Tu contraseña fue actualizada. Inicia sesión."
- [ ] `app/login/LoginForm.tsx`: "¿Olvidaste tu contraseña?" es `<Link href="/forgot-password">`, no `<span>`.
- [ ] `npm run lint` y `npm run build` siguen verdes.
- [ ] Regresión: SPEC 12 (invitación + email + activación) sigue funcionando; única diferencia: `from` ahora respeta `RESEND_FROM` si está seteada.
- [ ] Regresión: SPEC 10/13/14 (signup con invitación + Auth Hook HMAC) sigue funcionando.

## Decisions

- **Supabase Auth built-in** sobre custom Resend (decidido por el usuario). No añade helper a `utils/email.ts`.
- **URL flow `redirectTo → /auth/callback → next`** — patrón estándar de Supabase SSR. El callback intercambia el code antes de redirigir.
- **Anti-enumeración**: el server action de `/forgot-password` ignora el resultado de `resetPasswordForEmail` y siempre muestra el mismo texto neutro.
- **`RESEND_FROM` env var** con fallback al sandbox. El operador decide cuándo migrar; backward-compat con SPEC 12.
- **Sin maquette nueva** — reuso el split-screen del login. Si el equipo pide maquette después, spec aparte.
- **Sin tabla de audit** — `auth.audit_log_entries` ya lo cubre.
- **`signOut` + clear cookies en éxito de reset** — mismo patrón que SPEC 12 (`authCookieNames`); evita que la sesión de recovery persista.

## Risks

| Risk | Mitigation |
| --- | --- |
| Supabase Auth default SMTP no está configurado → emails de recovery caen al vacío. | Documentar en README que el operador debe configurar SMTP en el Dashboard de Supabase (Authentication → Emails). |
| User hace click en el email link dos veces → el segundo click falla porque el `recovery_token` es single-use. | El callback maneja el error explícitamente → redirige a `/login?error=recovery_session_expired`. |
| Resend sandbox sigue restringido hasta verificar dominio. | El helper de invitaciones (SPEC 12) sigue funcionando para el email registrado; documentado. La recuperación NO usa Resend, así que este riesgo no afecta a este spec. |
| Race condition: user pide recovery para un email que no existe → mensaje neutro "Si existe..." (igual que para uno existente). | Aceptable; anti-enumeración es una buena práctica. |
| El operador verifica un dominio pero olvida setear `RESEND_FROM` → sigue saliendo de `onboarding@resend.dev`. | Documentado explícitamente en la sección "Resend domain verification" del README. |

## What is **not** in this spec

- Custom branded recovery email (plantilla HTML editable en Supabase Dashboard).
- Magic links, OAuth, 2FA, SMS recovery.
- Rate limiting / brute-force protection custom (Supabase ya lo aplica).
- Self-serve Resend domain verification (es un paso manual con DNS).
- "Remember me" / extended sessions.
- Audit log de recovery requests del lado de la app (`auth.audit_log_entries` ya existe).
- Multi-language recovery email template.

Cada una de esas, si llega, va en su propio spec.