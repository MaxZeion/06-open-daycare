// supabase/functions/before_user_created/index.ts
//
// Auth Hook `before_user_created` de Supabase. Se ejecuta antes de crear
// cualquier `auth.users` vía signup público. Decisión:
//   - approve → Supabase Auth continúa con la creación del user.
//   - reject  → Supabase Auth aborta el signup y devuelve error al cliente.
//
// Reglas:
//   1. Rechaza si `role` o `daycare_id` vienen en user_metadata (vector de
//      privilege escalation cerrado por SPEC 13).
//   2. Rechaza si no hay `invitation_code` en user_metadata (cierra el
//      signup público directo; solo se puede signear vía flujo de
//      invitación o vía endpoint admin con service_role, que bypassea el
//      hook).
//
// Los mensajes van en español porque la app es en español (SPEC 06).

type WebhookPayload = {
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
  const payload = (await req.json()) as WebhookPayload;
  const meta = payload.user.user_metadata ?? {};

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