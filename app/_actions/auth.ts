"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

// Derive the Supabase storage key (sb-<project-ref>-auth-token) from the
// project URL so the sign-out always targets the right cookie, including any
// base64 chunk suffixes the SSR layer may have split it into.
function authStorageKeys(cookieStore: Awaited<ReturnType<typeof cookies>>): string[] {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host.split(".")[0];
  const base = `sb-${ref}-auth-token`;
  const keys = new Set<string>([base]);
  for (const { name } of cookieStore.getAll()) {
    if (name === base || name.startsWith(`${base}.`)) keys.add(name);
  }
  return [...keys];
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Invalidate the session on the Supabase Auth server and let the SSR
  // adapter persist it. That persistence runs from the async
  // `onAuthStateChange` handler, which can resolve after the redirect below,
  // so we also clear the cookie directly to guarantee it is gone in this
  // response (otherwise the session survives and /login bounces back to /).
  await supabase.auth.signOut();
  for (const name of authStorageKeys(cookieStore)) {
    cookieStore.delete(name);
  }

  redirect("/login");
}
