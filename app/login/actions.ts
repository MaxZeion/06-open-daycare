"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export interface SignInState {
  error?: string;
}

const INVALID_CREDENTIALS_MESSAGE = "Email o contraseña incorrectos.";

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  redirect(next);
}
