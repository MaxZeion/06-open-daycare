"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { Relationship } from "@/components/kids/mapKid";

export interface ActivateState {
  error?: string;
  ok?: boolean;
}

const CODE_RE = /^[A-Z0-9]{5}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;

interface InvitationInfo {
  invitation_id: string;
  child_id: string;
  child_full_name: string;
  room_name: string | null;
  parent_full_name: string;
  parent_email: string;
  relationship: Relationship;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expires_at: string;
  daycare_id: string | null;
}

function authCookieNames(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): string[] {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host.split(".")[0];
  const base = `sb-${ref}-auth-token`;
  const keys = new Set<string>([base]);
  for (const { name } of cookieStore.getAll()) {
    if (name === base || name.startsWith(`${base}.`)) keys.add(name);
  }
  return [...keys];
}

export async function activate(
  _prevState: ActivateState,
  formData: FormData,
): Promise<ActivateState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const consent = formData.get("consent");

  if (!CODE_RE.test(code)) {
    return { error: "Código de invitación inválido." };
  }

  if (!EMAIL_RE.test(email)) {
    return { error: "Introduce un email válido." };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  if (consent !== "on") {
    return {
      error: "Debes autorizar el uso de fotos para continuar.",
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: inviteRows } = await supabase.rpc("validate_invitation", {
    p_code: code,
  });

  const invite = ((inviteRows as InvitationInfo[] | null) ?? [])[0] ?? null;
  if (!invite) {
    return { error: "Código de invitación inválido." };
  }

  if (invite.status === "accepted" || invite.status === "cancelled") {
    return { error: "Esta invitación ya fue utilizada." };
  }

  if (invite.status === "expired" || new Date(invite.expires_at) < new Date()) {
    await supabase.rpc("expire_invitation", { p_invitation_id: invite.invitation_id });
    return { error: "El código ha expirado." };
  }

  if (invite.parent_email.toLowerCase() !== email) {
    return { error: "El email no coincide con la invitación." };
  }

  if (!invite.daycare_id) {
    return { error: "No se pudo completar la activación. Inténtalo de nuevo." };
  }

  // SPEC 13: el signup ya no envía `daycare_id` ni `role` en metadata
  // (privilege escalation vector). El Auth Hook `before_user_created`
  // rechaza metadata sensible; el trigger BEFORE INSERT
  // `on_auth_user_invitation_assigned` (migration 13) asigna
  // `daycare_id` + `role='parent'` desde la invitación de la BD, buscando
  // por `invitation_code` que pasamos aquí. `full_name` sí pasa tal cual
  // (no es sensible).
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: invite.parent_full_name,
        invitation_code: code,
      },
    },
  });

  if (signUpError) {
    if (signUpError.message.toLowerCase().includes("already registered")) {
      return { error: "Este email ya tiene una cuenta. Inicia sesión." };
    }
    // Mensajes del Auth Hook `before_user_created` (Edge Function) ya vienen
    // en español y son seguros para mostrar al usuario tal cual.
    return { error: signUpError.message };
  }

  const parentUser = signUpData.user;
  if (!parentUser || !signUpData.session) {
    return { error: "No se pudo completar la activación. Inténtalo de nuevo." };
  }

  // SPEC 13: usamos `service_role` (admin client) para estas dos escrituras
  // porque las policies RLS actuales en `parent_children` e `invitations`
  // solo permiten INSERT/UPDATE a `staff`/`admin`. El padre recién creado
  // tiene `role='parent'` y no podría escribir. La invitación ya fue
  // validada arriba (status='pending', email match, no expirada, child_id
  // viene de la invitación), así que es seguro escribir con service_role.
  const adminClient = createAdminClient();

  const { error: linkError } = await adminClient.from("parent_children").insert({
    parent_id: parentUser.id,
    child_id: invite.child_id,
    relationship: invite.relationship,
  });

  if (linkError && linkError.code !== "23505") {
    return { error: "No se pudo completar la activación. Inténtalo de nuevo." };
  }

  const { error: acceptError } = await adminClient
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.invitation_id);

  if (acceptError) {
    return { error: "No se pudo completar la activación. Inténtalo de nuevo." };
  }

  // La decisión del spec es mensaje + ir a /login (sin auto-login): el padre
  // queda con credenciales funcionales pero sesión cerrada.
  await supabase.auth.signOut();
  for (const name of authCookieNames(cookieStore)) {
    cookieStore.delete(name);
  }

  return { ok: true };
}
