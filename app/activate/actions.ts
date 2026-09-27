"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { Relationship } from "@/components/kids/mapKid";

export interface ActivateState {
  error?: string;
  ok?: boolean;
}

const CODE_RE = /^[A-Z0-9]{5}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;

interface InvitationLookup {
  id: string;
  child_id: string;
  full_name: string;
  email: string;
  relationship: Relationship;
  status: "pending" | "accepted" | "expired" | "cancelled";
  expires_at: string;
  children: { rooms: { daycare_id: string } | null } | null;
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

  const { data: invitation } = await supabase
    .from("invitations")
    .select(
      "id, child_id, full_name, email, relationship, status, expires_at, children ( rooms ( daycare_id ) )",
    )
    .eq("code", code)
    .maybeSingle();

  const invite = invitation as InvitationLookup | null;
  if (!invite) {
    return { error: "Código de invitación inválido." };
  }

  if (invite.status === "accepted" || invite.status === "cancelled") {
    return { error: "Esta invitación ya fue utilizada." };
  }

  if (invite.status === "expired" || new Date(invite.expires_at) < new Date()) {
    if (invite.status === "pending") {
      await supabase
        .from("invitations")
        .update({ status: "expired" })
        .eq("id", invite.id);
    }
    return { error: "El código ha expirado." };
  }

  if (invite.email.toLowerCase() !== email) {
    return { error: "El email no coincide con la invitación." };
  }

  const daycareId = invite.children?.rooms?.daycare_id;
  if (!daycareId) {
    return { error: "No se pudo completar la activación. Inténtalo de nuevo." };
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        daycare_id: daycareId,
        role: "parent",
        full_name: invite.full_name,
      },
    },
  });

  if (signUpError) {
    if (signUpError.message.toLowerCase().includes("already registered")) {
      return { error: "Este email ya tiene una cuenta. Inicia sesión." };
    }
    return { error: "No se pudo crear la cuenta. Inténtalo de nuevo." };
  }

  const parentUser = signUpData.user;
  if (!parentUser || !signUpData.session) {
    return { error: "No se pudo completar la activación. Inténtalo de nuevo." };
  }

  const { error: linkError } = await supabase.from("parent_children").insert({
    parent_id: parentUser.id,
    child_id: invite.child_id,
    relationship: invite.relationship,
  });

  if (linkError && linkError.code !== "23505") {
    return { error: "No se pudo completar la activación. Inténtalo de nuevo." };
  }

  const { error: acceptError } = await supabase
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

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
