import type { ReactNode } from "react";
import { getCurrentUser } from "@/utils/supabase/auth";
import { FamilyShellClient } from "./FamilyShellClient";

export async function FamilyShell({
  children,
  active = "feed",
}: {
  children: ReactNode;
  active?: "feed" | "summary";
}) {
  const currentUser = await getCurrentUser();
  return (
    <FamilyShellClient currentUser={currentUser} active={active}>
      {children}
    </FamilyShellClient>
  );
}