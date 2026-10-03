import type { ReactNode } from "react";
import { getCurrentUser } from "@/utils/supabase/auth";
import { FeedProvider } from "@/app/(staff)/_components/feed/FeedContext";
import type { Kid } from "@/app/(staff)/_components/kids/mockKids";
import { StaffShellClient } from "./StaffShellClient";
import type { SectionId } from "./StaffSidebar";

export async function StaffShell({
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
      <StaffShellClient currentUser={currentUser} active={active}>
        {children}
      </StaffShellClient>
    </FeedProvider>
  );
}
