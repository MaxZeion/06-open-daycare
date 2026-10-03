"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  DEFAULT_FAMILY_NEXT,
  DEFAULT_STAFF_NEXT,
} from "@/utils/supabase/auth";
import type { CurrentUserRole } from "@/utils/supabase/types";

export interface SignInState {
  error?: string;
}

const INVALID_CREDENTIALS_MESSAGE = "Email o contraseña incorrectos.";

function isCurrentUserRole(value: unknown): value is CurrentUserRole {
  return value === "staff" || value === "parent" || value === "admin";
}

function homeForRole(role: CurrentUserRole): string {
  return role === "parent" ? DEFAULT_FAMILY_NEXT : DEFAULT_STAFF_NEXT;
}

function isNextCoherent(next: string, role: CurrentUserRole): boolean {
  if (role === "parent") {
    return next === DEFAULT_FAMILY_NEXT || next.startsWith(`${DEFAULT_FAMILY_NEXT}/`);
  }
  return next === DEFAULT_STAFF_NEXT || next.startsWith("/kids");
}

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? DEFAULT_STAFF_NEXT);

  if (!email || !password) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const role = claims?.app_metadata?.role;

  if (!isCurrentUserRole(role)) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const finalNext = isNextCoherent(next, role) ? next : homeForRole(role);
  redirect(finalNext);
}
