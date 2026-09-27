import type { ReactNode } from "react";
import { getCurrentUser } from "@/utils/supabase/auth";
import { AppShellClient } from "./AppShellClient";
import type { SectionId } from "./Sidebar";

export async function AppShell({
  children,
  active = "feed",
}: {
  children: ReactNode;
  active?: SectionId;
}) {
  const currentUser = await getCurrentUser();
  return (
    <AppShellClient currentUser={currentUser} active={active}>
      {children}
    </AppShellClient>
  );
}
