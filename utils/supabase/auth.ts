import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "./server";

export type CurrentUserRole = "staff" | "parent" | "admin";

export interface CurrentUser {
  userId: string;
  email: string | null;
  daycareId: string;
  role: CurrentUserRole;
  fullName: string;
}

interface AppMetadata {
  daycare_id?: string;
  role?: CurrentUserRole;
  full_name?: string;
}

function isCurrentUserRole(value: unknown): value is CurrentUserRole {
  return value === "staff" || value === "parent" || value === "admin";
}

export async function getCurrentUser(nextPath?: string): Promise<CurrentUser> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    redirect(`/login?next=${encodeURIComponent(nextPath ?? "/")}`);
  }

  const appMetadata = (claims.app_metadata ?? {}) as AppMetadata;
  const { daycare_id, role, full_name } = appMetadata;

  if (
    typeof daycare_id !== "string" ||
    !isCurrentUserRole(role) ||
    typeof full_name !== "string"
  ) {
    redirect(`/login?next=${encodeURIComponent(nextPath ?? "/")}`);
  }

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    daycareId: daycare_id,
    role,
    fullName: full_name,
  };
}
