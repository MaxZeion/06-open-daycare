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

- [ ] `supabase/functions/before_user_created/deno.json` tiene import map con `standardwebhooks@1.0.0`.
- [ ] `supabase/functions/before_user_created/index.ts` modificado: importa `Webhook` desde `standardwebhooks`, lee `BEFORE_USER_CREATED_HOOK_SECRET` de `Deno.env`, instancia un `Webhook` por secret (multi-secret split por `|`), itera intentando verificar el payload crudo.
- [ ] Si la firma no matchea ningún secret → 401 con body `{ "error": { "message": "Invalid request signature" } }` y `Content-Type: application/json`.
- [ ] Si la firma matchea → procesa las reglas de negocio de SPEC 13 (rechazar `role`/`daycare_id` o sin `invitation_code`, aprobar lo demás).
- [ ] Si la variable `BEFORE_USER_CREATED_HOOK_SECRET` no está configurada → la función falla al iniciar con un error claro (no acepta requests sin secret).
- [ ] Edge function re-desplegada (version 2) vía MCP. *Verificable: `supabase_list_edge_functions` muestra la función con `version=2`.*
- [ ] Smoke test con `curl`:
  - Request con payload firmado correctamente (usando un secret generado localmente con `whsec_` o el del Dashboard) → hook aprueba o rechaza según el body.
  - Request sin firma → 401.
  - Request con firma incorrecta → 401.
- [ ] `npm run lint` y `npm run build` siguen verdes (la edge function no entra en el bundle de Next.js gracias al `tsconfig.json` exclude).
- [ ] Regresión: el flujo de SPEC 13 (signup con invitación → trigger BEFORE asigna `daycare_id`/`role`) sigue funcionando cuando el hook está activo y aprueba.
- [ ] Consola del navegador sin nuevos errores en el flujo de signup vía `/activate`.

## Decisions

- **Sí:** librería oficial `standardwebhooks` (recomendada por Supabase). **No:** implementación manual con `crypto.subtle` — re-implementar el spec es propenso a bugs.
- **Sí:** multi-secret (pipe-separated). La doc de Supabase lo soporta nativamente (`Webhook` se puede instanciar varias veces con cada secret; la función prueba cada uno). Habilita rotación sin downtime.
- **Sí:** reject 401 si firma inválida (defense in depth). **No:** log warning y continuar — abre vector de falsificación.
- **No:** verificar firma solo en approve. La verificación debe ocurrir antes de CUALQUIER lógica de negocio, incluso si va a reject.
- **Sí:** si `BEFORE_USER_CREATED_HOOK_SECRET` falta, throw al iniciar. **No:** secret vacío que acepta todo (worst-case). Fail closed.
- **Sí:** mantener el formato JSON actual del payload que Supabase envía (`{ user: {...}, metadata: {...} }`) — el hook `before_user_created` lo usa, no `{}` como el resto de hooks.
- **No:** actualizar `supabase/config.toml` (no existe en este proyecto cloud-managed). La configuración se hace en el Dashboard.

## Risks

| Risk | Mitigation |
| --- | --- |
| Si el secret rota y el cliente no actualiza el env var, la verificación falla y todo signup público se rechaza (lockout). | El multi-secret permite coexistir secret viejo + nuevo durante la rotación. AGENTS.md puede documentar el procedimiento. |
| El `if (secrets.length === 0) throw` bloquea todos los signups si se olvida configurar el secret. | Fail closed es preferible a fail open. El operador nota el error inmediatamente en logs de la edge function. |
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