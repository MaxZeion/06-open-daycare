"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export interface UpdatePasswordState {
  error?: string;
}

const MIN_PASSWORD_LENGTH = 8;

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

export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  if (password !== confirm) {
    return { error: "Las contraseñas no coinciden." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return {
      error: "No se pudo actualizar la contraseña. Inténtalo de nuevo.",
    };
  }

  await supabase.auth.signOut();
  for (const name of authCookieNames(cookieStore)) {
    cookieStore.delete(name);
  }

  redirect("/login?reset=ok");
}