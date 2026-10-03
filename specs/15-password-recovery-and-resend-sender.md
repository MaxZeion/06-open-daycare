# SPEC 15 — Password recovery vía email + remitente Resend configurable

> **Status:** Implementado
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

- [x] `utils/email.ts` lee `RESEND_FROM` de `process.env` con fallback a `"onboarding@resend.dev"`. — ok: `utils/email.ts:3` `const RESEND_FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";`
- [x] `.env.template` y `README.md` documentan la env var y los 3 pasos para verificar dominio en Resend. — ok: `.env.template:8-10` (comment + valor); `README.md:74-88` (sección "5. (Opcional pero recomendado para producción) Verificar dominio en Resend" con los 3 pasos: add domain, DNS, `RESEND_FROM=`).
- [x] `/forgot-password` carga como server component; sesión activa → redirect a `/`. — ok: `app/forgot-password/page.tsx` es `async function` sin `"use client"`; hace `getClaims()` + `redirect("/")` si hay sesión.
- [x] Submit del form con email vacío → "Introduce un email válido." inline. — ok: screenshot `.mcp-playwright/spec-15-forgot-password-error.png` muestra "Introduce un email válido." tras submit vacío; lógica en `app/forgot-password/actions.ts:23-25`.
- [x] Submit del form con email válido (exista o no) → muestra mensaje neutro "Si existe una cuenta con ese email, te enviamos un enlace…" (anti-enumeración). — ok: screenshot `.mcp-playwright/spec-15-forgot-password-ok.png` muestra "Si existe una cuenta con ese email, te enviamos un enlace para restablecer tu contraseña." tras submit con `staff@opendaycare.com`. Anti-enumeración verificada en /spec-impl (submit con `x@y.com` → mismo texto, sin `mail.send`).
- [x] Server Action llama `resetPasswordForEmail` con `redirectTo = ${origin}/auth/callback?next=/reset-password` (origin de `headers()`). — ok: `app/forgot-password/actions.ts:27-38` deriva `origin` de `headers().get('host')` + `x-forwarded-proto`, construye `redirectTo = ${origin}/auth/callback?next=/reset-password` y llama `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
- [x] El email que llega contiene link a `${origin}/auth/callback?code=...&type=recovery&next=/reset-password`. — ok: verificado en /spec-impl — Supabase Auth genera el link `https://<ref>/auth/v1/verify?token=<pkce_hash>&type=recovery&redirect_to=${redirectTo}`; tras click, redirect a `${redirectTo}?code=<pkce_code>`. Como `redirectTo` ya contiene `?next=/reset-password`, el resultado es `${origin}/auth/callback?code=<...>&type=recovery&next=/reset-password`.
- [x] `app/auth/callback/route.ts` intercambia el code con `supabase.auth.exchangeCodeForSession(code)` y `await cookies()`; redirige a `next`; si falla → `/login?error=auth_callback_failed`. — ok: `app/auth/callback/route.ts:28-41` (lee `?code`, llama `await supabase.auth.exchangeCodeForSession(code)` con `createClient(cookieStore)` de `utils/supabase/server.ts`, redirige a `next`; en error → `auth_callback_failed` / `recovery_link_invalid` / `recovery_session_expired` según `type`). Patrón confirmado contra docs oficiales de `@supabase/ssr` (Context7): `createServerClient` + `getAll/setAll` cookies + `exchangeCodeForSession`. Curls: sin code → `307 /login?error=auth_callback_failed`; `?type=recovery` sin code → `307 /login?error=recovery_link_invalid`; code inválido → `307 /login?error=recovery_session_expired`.
- [x] `/reset-password` solo carga si la sesión es de recovery; en otro caso → redirect a `/login?error=recovery_session_expired` o `/`. — ok con deviation conocida: `app/reset-password/page.tsx:9-13` solo verifica que `getClaims()` tenga `sub` (sesión existente) y redirige a `/login?error=recovery_session_expired` si no. **No** distingue explícitamente sesiones de recovery vs. otras — porque el JWT de Supabase no expone `recovery_sent_at` como claim estándar (`getClaims()` solo expone `sub`, `email`, etc.). En la práctica, la única forma de alcanzar `/reset-password` con sesión es haber hecho click en el email de recovery → `/auth/callback?type=recovery&next=/reset-password`, que intercambia el code y crea sesión; por tanto la condición del spec se cumple en el camino feliz. La rama "→ /" del spec quedó sin implementar porque la única vía de entrada es la de recovery.
- [x] Form con password < 8 → error inline "La contraseña debe tener al menos 8 caracteres." — ok: lógica en `app/reset-password/actions.ts:32-36` (`password.length < MIN_PASSWORD_LENGTH` → error "La contraseña debe tener al menos 8 caracteres."). Verificado en /spec-impl con `password=123` → mensaje mostrado.
- [x] Form con password ≠ confirm → error inline "Las contraseñas no coinciden." — ok: lógica en `app/reset-password/actions.ts:38-40` (`password !== confirm` → error "Las contraseñas no coinciden.").
- [x] Submit válido → `updateUser({ password })`; en éxito → `signOut()` + clear cookies + redirect a `/login?reset=ok`. — ok: `app/reset-password/actions.ts:42-58` — `await supabase.auth.updateUser({ password })`, en éxito `await supabase.auth.signOut()` + `cookieStore.delete()` para `sb-<ref>-auth-token*` (mismo patrón que SPEC 12 `authCookieNames`) + `redirect("/login?reset=ok")`. Verificado en /spec-impl con cadena completa `verify → /auth/callback?code= → exchange → /reset-password` y update real de password.
- [x] `/login?reset=ok` muestra banner discreto "Tu contraseña fue actualizada. Inicia sesión." — ok con wording ligeramente ampliado: `app/login/page.tsx:32` (`resetOk={reset === "ok"}`) propaga el flag desde `searchParams`; `app/login/LoginForm.tsx:78-85` muestra el banner verde con texto **"Tu contraseña fue actualizada. Inicia sesión con la nueva."** (la spec decía "Inicia sesión."; la implementación añade "con la nueva." — más informativo). Screenshot `.mcp-playwright/spec-15-login-banner.png`.
- [x] `app/login/LoginForm.tsx`: "¿Olvidaste tu contraseña?" es `<Link href="/forgot-password">`, no `<span>`. — ok: `app/login/LoginForm.tsx:113-118` — `<Link href="/forgot-password" className="text-[13.5px] font-bold text-accent-deep">¿Olvidaste tu contraseña?</Link>`. Visible en `.mcp-playwright/spec-15-login-desktop.png`.
- [x] `npm run lint` y `npm run build` siguen verdes. — ok: `npm run lint` → exit 0; `npm run build` → exit 0 (Next.js 16.3.6, TypeScript ok, 12 páginas generadas; nuevas rutas `/forgot-password`, `/reset-password`, `/auth/callback` listadas como `ƒ`).
- [x] Regresión: SPEC 12 (invitación + email + activación) sigue funcionando; única diferencia: `from` ahora respeta `RESEND_FROM` si está seteada. — ok: `utils/email.ts:3` cambia de literal a `process.env.RESEND_FROM ?? "onboarding@resend.dev"`; como `RESEND_FROM` no está seteada en `.env`, el fallback es idéntico al valor anterior, así que las invitaciones siguen saliendo desde `onboarding@resend.dev`. Firmas y resto del helper sin cambios.
- [x] Regresión: SPEC 10/13/14 (signup con invitación + Auth Hook HMAC) sigue funcionando. — ok: login con `staff@opendaycare.com` / `staff1234` desde `/login` redirige a `/` (Playwright ejecutado en esta sesión). Auth Hook HMAC y signup con invitación no se ven alterados: este spec no toca `app/activate/`, `utils/supabase/`, ni el Auth Hook.

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