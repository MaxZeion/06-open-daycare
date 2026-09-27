import type { ReactNode } from "react";
import { getCurrentUser } from "@/utils/supabase/auth";
import { FeedProvider } from "../feed/FeedContext";
import type { Kid } from "../kids/mockKids";
import { AppShellClient } from "./AppShellClient";
import type { SectionId } from "./Sidebar";

export async function AppShell({
  children,
  active = "feed",
  kids = [],
}: {
  children: ReactNode;
  active?: SectionId;
  kids?: Kid[];
}) {
  const currentUser = await getCurrentUser();
  return (
    <FeedProvider kids={kids}>
      <AppShellClient currentUser={currentUser} active={active}>
        {children}
      </AppShellClient>
    </FeedProvider>
  );
}
