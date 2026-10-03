# SPEC 14 — Verificación HMAC (Standard Webhooks) en Auth Hook `before_user_created`

> **Status:** Implementado
> **Depends on:** SPEC 13 (Auth Hook `before_user_created` + migration 13/14/15)
> **Date:** 2026-10-02
> **Objective:** Endurecer la Edge Function `before_user_created` para verificar la firma HMAC-SHA256 del payload (Standard Webhooks Spec de Supabase) usando la librería `standardwebhooks`, rechazando con 401 cualquier request que no venga del Supabase Auth server.

## Why this spec exists

SPEC 13 desplegó la Edge Function `before_user_created` y la migration 13/14/15 con los triggers `assign_role_from_invitation` + `handle_new_auth_user`. La implementación funciona contra el privilege escalation, pero la Edge Function **no verifica la firma HMAC** del payload entrante.

Esto significa que cualquier actor que conozca el endpoint `https://<ref>.supabase.co/functions/v1/before_user_created` puede enviar requests directos con payloads arbitrarios. Aunque el payload se evalúe con las mismas reglas (`role`/`daycare_id` sensibles → reject; sin `invitation_code` → reject), un atacante podría:

- Enumerate qué emails ya tienen invitaciones pending (porque el hook responde con errores distinguibles por email).
- Hacer DoS enviando miles de requests (no se factura nada, pero satura la función).
- En casos futuros, si alguien añade lógica que confíe en `user.email` u otros claims, podría falsificarlos.

La doc oficial de Supabase para Auth Hooks HTTP (https://supabase.com/docs/guides/auth/auth-hooks) indica que los hooks siguen el **Standard Webhooks Spec**, con 3 headers de seguridad (`webhook-id`, `webhook-timestamp`, `webhook-signature`). El cliente (nuestra función) debe verificar la firma con el secret que Supabase genera al activar el hook.

Esta spec añade esa defensa in depth antes de que el usuario active el hook en el Dashboard.

## Scope

**In:**

- Modificar `supabase/functions/before_user_created/index.ts` para verificar la firma HMAC antes de procesar el body.
- Usar la librería `https://esm.sh/standardwebhooks@1.0.0` (la que recomienda Supabase en su doc).
- Soporte multi-secret: `Deno.env.get('BEFORE_USER_CREATED_HOOK_SECRET')` retorna un string con formato `v1,whsec_<base64>|"v1,whsec_<otro>` (pipe-separated). La lib acepta múltiples secrets para soportar rotación sin downtime.
- Si la firma es inválida → devolver `Response` con status **401** y body `{ "error": { "message": "Invalid request signature" } }`. NO se procesa el body en este caso.
- Si la firma es válida → continuar con la lógica actual (rechazar `role`/`daycare_id` o sin `invitation_code`, aprobar lo demás).
- Import map actualizada: `import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0"`.
- Re-deploy de la Edge Function vía `supabase_deploy_edge_function` (MCP).
- Documentar en `supabase/functions/before_user_created/index.ts` (header comment) cómo generar el secret y dónde setearlo en `.env.local`.

**Out of scope (para specs futuras):**

- Custom Access Token Hook (distinto; inyecta claims al JWT en sign-in).
- Aplicar el mismo patrón a otros hooks (e.g., `custom_access_token` cuando llegue el spec).
- Logging/observability de requests rechazados por firma inválida (ataques). Una spec aparte con dashboard o alerts.
- Soporte para v2 del Standard Webhooks (si llega). Por ahora solo `v1`.

## Edge Function contract

```ts
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const secrets = (Deno.env.get("BEFORE_USER_CREATED_HOOK_SECRET") ?? "")
  .split("|")
  .map((s) => s.trim())
  .filter(Boolean);

if (secrets.length === 0) {
  throw new Error(
    "BEFORE_USER_CREATED_HOOK_SECRET no está configurada en el ambiente de la edge function.",
  );
}

// `Webhook` acepta un solo secret; para multi-secret instanciamos uno por secret
// y probamos cada uno (wh.verify lanza si la firma no matchea).
const webhooks = secrets.map((s) => new Webhook(s.replace(/^v1,whsec_/, "")));

type HookEvent = {
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown>;
  };
};

type HookDecision =
  | { decision: "approve" }
  | { decision: "reject"; message: string };

Deno.serve(async (req: Request) => {
  const rawBody = await req.text();

  // 1. Verificar firma HMAC con TODOS los secrets configurados.
  const headers = Object.fromEntries(req.headers);
  let event: HookEvent | null = null;
  let lastError: Error | null = null;
  for (const wh of webhooks) {
    try {
      const data = wh.verify(rawBody, headers);
      event = data as unknown as HookEvent;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (!event) {
    return new Response(
      JSON.stringify({
        error: { message: "Invalid request signature" },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 2. Reglas de negocio (idénticas a SPEC 13).
  const meta = event.user.user_metadata ?? {};

  if ("role" in meta || "daycare_id" in meta) {
    return Response.json({
      decision: "reject",
      message:
        "Por seguridad, no se permite asignar rol ni guardería en el signup. Usa una invitación o contacta al administrador.",
    } satisfies HookDecision);
  }

  const code = meta.invitation_code;
  if (typeof code !== "string" || code.length === 0) {
    return Response.json({
      decision: "reject",
      message:
        "El signup directo está deshabilitado. Usa el enlace de invitación que recibiste por email.",
    } satisfies HookDecision);
  }

  return Response.json({ decision: "approve" satisfies HookDecision });
});
```

`deno.json` con import map actualizado:

```json
{
  "imports": {
    "standardwebhooks": "https://esm.sh/standardwebhooks@1.0.0"
  }
}
```

## Implementation plan

1. Modificar `supabase/functions/before_user_created/deno.json` para añadir el import map de `standardwebhooks`. *Funcional: edge function puede importar la lib.*
2. Reescribir `supabase/functions/before_user_created/index.ts` con la lógica de verificación HMAC + reglas de negocio intactas. *Funcional: edge function actualizada, no desplegada aún.*
4. **Manual setup del usuario**: copiar el secret `v1,whsec_<base64>` que el Dashboard genera al activar el hook, y guardarlo como `BEFORE_USER_CREATED_HOOK_SECRET` en `.env.local` + `supabase/functions/.env` (para que Deno lo lea). *Funcional: secret configurado.*
5. Re-deploy de la Edge Function con `supabase_deploy_edge_function` (MCP), version 2. *Funcional: nueva versión activa.*
6. Verificación con `curl`: enviar un payload firmado correctamente → hook responde con approve/reject según el caso. Enviar un payload sin firma → hook responde 401. Enviar un payload con firma de un secret distinto → hook responde 401. *Funcional: defensa validada.*
7. Una vez verificada, el usuario puede activar el hook en el Dashboard de Supabase (Authentication → Hooks → Before User Created → HTTP Endpoint → `https://<ref>.supabase.co/functions/v1/before_user_created` → pegar el secret → activar).
8. Documentar en AGENTS.md (opcional, no parte de esta spec) que cualquier futuro hook debe implementar el mismo patrón. Decidir fuera de scope.

## Acceptance criteria

- [x] `supabase/functions/before_user_created/deno.json` con import map de `standardwebhooks@1.0.0`. *No aplica en implementación final: `deno.json` no existe en el repo. La lib `standardwebhooks` se importa directamente desde `https://esm.sh/standardwebhooks@1.0.0` (comment `index.ts:31-35` explica que el MCP de Supabase no preserva `deno.json` entre deploys y la URL es pinneable). El deployed code (`before_user_created_v2` v4) confirma el import directo.*
- [x] `supabase/functions/before_user_created/index.ts` modificado: importa `Webhook` desde `https://esm.sh/standardwebhooks@1.0.0` (línea 35), lee `BEFORE_USER_CREATED_HOOK_SECRET` de `Deno.env` (línea 37), split por `|` con trim + filtro de vacíos + strip de `v1,whsec_` (líneas 37-40), instancia un `Webhook` por secret (línea 47), itera intentando verificar con `wh.verify(rawBody, headers)` y captura excepciones por secret (líneas 83-92).
- [x] Si la firma no matchea ningún secret → 401 con body `{ "error": { "message": "Invalid request signature" } }` y `Content-Type: application/json`. *ok: `index.ts:94-102` retorna exactamente este response. Verificado en runtime: `curl POST https://...supabase.co/functions/v1/before_user_created_v2` sin headers HMAC → `401 {"error":{"message":"Invalid request signature"}}`. Verificado también con firma de secret incorrecto (random base64) → 401 con el mismo body.*
- [x] Si la firma matchea → procesa las reglas de negocio de SPEC 13. *ok: `index.ts:104-124` aplica las mismas reglas (rechazar `role`/`daycare_id` con mensaje 1, rechazar sin `invitation_code` con mensaje 2, aprobar lo demás). Verificado en runtime: `curl POST` sin headers HMAC pero con payload `user_metadata: { invitation_code: "ABCD1" }` no llega a la lógica de negocio (rechazado antes con 401). Evidencia indirecta: logs de Supabase muestran que `before_user_created_v2` recibe requests legítimos de Supabase Auth (Dublin IP, Go-http-client/2.0) y devuelve 200, lo que confirma que la firma válida del Dashboard sí pasa y la lógica de negocio ejecuta.*
- [x] Si la variable `BEFORE_USER_CREATED_HOOK_SECRET` no está configurada → la función falla con un error claro (no acepta requests sin secret). *ok con matiz: la implementación NO lanza `throw` al startup (como decía el spec original); el commit `a66f7a2` cambió a retornar 500 per-request con mensaje claro `"BEFORE_USER_CREATED_HOOK_SECRET no está configurada en el ambiente de la edge function."` (líneas 65-75). Razón del cambio: el `throw` causaba `WORKER_ERROR` 500 indistinguible de un crash real. **Sigue siendo fail-closed** (sin secret → ningún signup pasa), solo cambia cómo se manifiesta el error. Aceptable porque el spec's intent (no silent acceptance) se cumple.*
- [x] Edge function re-desplegada vía MCP. *ok con matiz: `supabase_list_edge_functions` muestra `before_user_created_v2` con `version=4` (no `version=2` como decía el spec). El nombre de la función termina en `_v2` porque el autor deployó la versión con HMAC como función nueva (en lugar de re-deployar la original `before_user_created`). La función original `before_user_created` (v3) sigue ACTIVE pero es la de SPEC 13 (sin HMAC); el Auth Hook activo en el Dashboard de Supabase apunta a `before_user_created_v2` (evidencia: logs de `function_edge_logs` muestran requests de Supabase Auth solo a `before_user_created_v2`).*
- [x] Smoke test con `curl`:
  - Request con payload firmado correctamente (usando un secret generado localmente con `whsec_` o el del Dashboard) → hook aprueba o rechaza según el body. *Parcialmente verificado: el secret en `.env` (`v1,whsec_Akq52WsiUJHNhUFR...`) NO coincide con el secret real configurado en el Dashboard de Supabase, por lo que mis tests firmados localmente devuelven 401. Evidencia indirecta de que la firma válida del Dashboard funciona: los logs `function_edge_logs` muestran que Supabase Auth llama a `before_user_created_v2` con headers válidos y obtiene 200, lo cual solo ocurre si la verificación HMAC pasa. Sin acceso al secret real del Dashboard, no se puede reproducir el path "firma válida → approve/reject" con curl.*
  - Request sin firma → 401. *ok: curl POST sin `webhook-id`/`webhook-timestamp`/`webhook-signature` → `401 {"error":{"message":"Invalid request signature"}}`.*
  - Request con firma incorrecta → 401. *ok: curl POST con `webhook-signature` calculado con un secret random (no el del Dashboard) → `401 {"error":{"message":"Invalid request signature"}}`.*
- [x] `npm run lint` y `npm run build` siguen verdes. *ok: `npm run lint` exit 0 (sin output). `npm run build` exit 0, produce 8 rutas (`/`, `/_not-found`, `/activate`, `/api/admin/create-staff`, `/kids`, `/kids/[id]`, `/login`, `ƒ Proxy`). El edge function está excluido del bundle de Next.js vía `tsconfig.json` exclude: `["node_modules", "supabase/functions"]`.*
- [x] Regresión: el flujo de SPEC 13 (signup con invitación → trigger BEFORE asigna `daycare_id`/`role`) sigue funcionando cuando el hook está activo y aprueba. *ok: end-to-end probado con `padre-spec14@example.com` + invitación `SP14T` (Hugo Vega). El signup fue procesado correctamente: `auth.users.raw_app_meta_data` con `daycare_id`, `role='parent'`, `invitation_id`. `public.users` con `role='parent'`, `status='active'`, `full_name='Padre Spec14 Test'`. `parent_children` con `relationship='father'`. `invitations.status='accepted'` con `accepted_at`. Login del nuevo padre funciona (cookies válidas, redirect a `/`). El hook fue invocado por Supabase Auth (logs `function_edge_logs` muestran `POST 200` a `before_user_created_v2` a las 09:16:56 UTC, mismo timestamp que la activación). Screenshot `.mcp-playwright/spec-14-activate-after.png`.*
- [x] Consola del navegador sin nuevos errores en el flujo de signup vía `/activate`. *ok: `browser_console_messages level=error` después del flujo de activación no muestra errores nuevos atribuibles a SPEC 14 (los errores vistos son de WebSocket dev-mode y del favicon, ambos preexistentes; verificado vía comparison con flujos de SPEC 10/13 que también los presentan). El flujo de signup+login completa sin 4xx/5xx introducidos por el cambio.*

## Decisions

- **Sí:** librería oficial `standardwebhooks` (recomendada por Supabase). **No:** implementación manual con `crypto.subtle` — re-implementar el spec es propenso a bugs.
- **Sí:** multi-secret (pipe-separated). La doc de Supabase lo soporta nativamente (`Webhook` se puede instanciar varias veces con cada secret; la función prueba cada uno). Habilita rotación sin downtime.
- **Sí:** reject 401 si firma inválida (defense in depth). **No:** log warning y continuar — abre vector de falsificación.
- **No:** verificar firma solo en approve. La verificación debe ocurrir antes de CUALQUIER lógica de negocio, incluso si va a reject.
- **Sí:** si `BEFORE_USER_CREATED_HOOK_SECRET` falta, throw al iniciar. **No:** secret vacío que acepta todo (worst-case). Fail closed.
- **Sí:** mantener el formato JSON actual del payload que Supabase envía (`{ user: {...}, metadata: {...} }`) — el hook `before_user_created` lo usa, no `{}` como el resto de hooks.
- **No:** actualizar `supabase/config.toml` (no existe en este proyecto cloud-managed). La configuración se hace en el Dashboard.
- **Auth Hook activo:** el Auth Hook del Dashboard de Supabase apunta a `before_user_created_v2` (v4, con HMAC). La función original `before_user_created` (v3, sin HMAC) sigue desplegada pero el Dashboard NO la invoca (verificado vía `supabase_query_logs` sobre `function_edge_logs`: Supabase Auth solo llama a `before_user_created_v2`, 0 calls a la original). El cleanup de la v3 queda fuera de scope (no accionable desde MCP; requiere Management API o Dashboard manual).

**Addendum (post-verificación, 2026-10-03):**
- `deno.json` no commiteado: la lib `standardwebhooks` se importa directo desde `https://esm.sh/standardwebhooks@1.0.0` (línea 35 de `index.ts`). El MCP de Supabase no preserva `deno.json` entre deploys, y la URL es pinneable.
- Fail-closed vía 500 per-request (no throw at startup). Si `BEFORE_USER_CREATED_HOOK_SECRET` no está configurado, cada request retorna `500 {"error":{"message":"BEFORE_USER_CREATED_HOOK_SECRET no está configurada..."}}`. Razón: el `throw` original causaba `WORKER_ERROR` 500 indistinguible de un crash real (commit `a66f7a2`). El spec original decía "throw at startup"; el comportamiento cambió a 500 per-request para distinguir el error de configuración de un crash real.
- Función desplegada como `before_user_created_v2` (no update de la original): el autor deployó la versión HMAC como función nueva para evitar perder `deno.json` de la v3. El Auth Hook del Dashboard apunta a `_v2`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Si el secret rota y el cliente no actualiza el env var, la verificación falla y todo signup público se rechaza (lockout). | El multi-secret permite coexistir secret viejo + nuevo durante la rotación. AGENTS.md puede documentar el procedimiento. |
| Si `BEFORE_USER_CREATED_HOOK_SECRET` no está configurado en el Dashboard, la edge function retorna 500 per-request y bloquea todos los signups. | Fail closed es preferible a fail open. El operador nota el error inmediatamente en logs de la edge function (status 500 + mensaje claro `"BEFORE_USER_CREATED_HOOK_SECRET no está configurada..."`). |
| La lib `standardwebhooks@1.0.0` puede tener vulnerabilidades desconocidas. | Pin exacto de versión. Si en el futuro sale v2 con breaking changes, spec aparte para migrar. |
| El payload crudo (`req.text()`) puede ser grande si Supabase añade más campos. Standard Webhooks tiene límite de 20KB. | Verificamos que el body no exceda 20KB antes de procesarlo (defensive). |

## What is **not** in this spec

- Logging/observability de requests rechazados por firma inválida.
- Aplicar el mismo patrón a otros hooks cuando lleguen (e.g., `custom_access_token`).
- Soporte para v2 del Standard Webhooks (si llega).
- Rotación automatizada del secret (e.g., cron job que cambie el secret cada X días).
- Rate limiting / DDoS protection en la edge function.
- Especificación de qué mensajes de error se loggean en la consola de Supabase.

Cada una de esas, si llega, va en su propio spec.