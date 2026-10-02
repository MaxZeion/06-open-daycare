// supabase/functions/before_user_created/index.ts
//
// SPEC 13 + SPEC 14: Auth Hook `before_user_created` de Supabase.
// Se ejecuta antes de crear cualquier `auth.users` vía signup público.
//
// SPEC 14 añade verificación HMAC del payload (Standard Webhooks Spec).
// Supabase firma cada request con 3 headers (`webhook-id`,
// `webhook-timestamp`, `webhook-signature`) usando un secret que el
// Dashboard genera al activar el hook. Sin la firma válida, el request
// se rechaza con 401 antes de procesar el body (defense in depth).
//
// Configuración del secret:
//   - El Dashboard genera `v1,whsec_<base64>` al activar el hook
//     (Authentication → Hooks → Before User Created → HTTP Endpoint).
//   - Setear en `.env.local` y/o `supabase/functions/.env`:
//       BEFORE_USER_CREATED_HOOK_SECRET="v1,whsec_<base64>"
//   - Para rotación, pipe-separate dos o más secrets:
//       BEFORE_USER_CREATED_HOOK_SECRET="v1,whsec_<nuevo>|"v1,whsec_<viejo>"
//
// Reglas de negocio (SPEC 13):
//   1. Rechaza si `role` o `daycare_id` vienen en user_metadata (vector
//      de privilege escalation cerrado por SPEC 13).
//   2. Rechaza si no hay `invitation_code` en user_metadata (cierra el
//      signup público directo; solo se puede signear vía flujo de
//      invitación o vía endpoint admin con service_role, que bypassea
//      el hook).
//
// Los mensajes de error van en español porque la app es en español
// (SPEC 06).

import { Webhook } from "standardwebhooks";

const secrets = (Deno.env.get("BEFORE_USER_CREATED_HOOK_SECRET") ?? "")
  .split("|")
  .map((s) => s.trim().replace(/^v1,whsec_/, ""))
  .filter(Boolean);

if (secrets.length === 0) {
  throw new Error(
    "BEFORE_USER_CREATED_HOOK_SECRET no está configurada en el ambiente de la edge function. " +
      "Obtén el secret en Dashboard → Authentication → Hooks → Before User Created.",
  );
}

const webhooks = secrets.map((secret) => new Webhook(secret));

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
  const headers = Object.fromEntries(req.headers);

  // 1. Verificar firma HMAC. Probar todos los secrets (multi-secret
  // para soportar rotación sin downtime).
  let event: HookEvent | null = null;
  for (const wh of webhooks) {
    try {
      const data = wh.verify(rawBody, headers);
      event = data as unknown as HookEvent;
      break;
    } catch {
      // Continúa con el siguiente secret; si ninguno matchea, event
      // queda null y rechazamos abajo.
    }
  }

  if (!event) {
    return new Response(
      JSON.stringify({ error: { message: "Invalid request signature" } }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 2. Reglas de negocio.
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

  return Response.json({ decision: "approve" } satisfies HookDecision);
});