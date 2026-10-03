"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export interface RequestPasswordResetState {
  error?: string;
  ok?: boolean;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const INVALID_EMAIL_MESSAGE = "Introduce un email válido.";
const GENERIC_ERROR_MESSAGE =
  "No se pudo enviar el correo. Intenta de nuevo más tarde.";

export async function requestPasswordReset(
  _prevState: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return { error: INVALID_EMAIL_MESSAGE };
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  const redirectTo = `${origin}/auth/callback?next=/reset-password`;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    return { error: GENERIC_ERROR_MESSAGE };
  }

  return { ok: true };
}