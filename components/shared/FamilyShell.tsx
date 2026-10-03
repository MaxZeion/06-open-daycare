import type { ReactNode } from "react";
import { getCurrentUser } from "@/utils/supabase/auth";
import { FamilyShellClient } from "./FamilyShellClient";
import { FeedProvider } from "@/app/(staff)/_components/feed/FeedContext";

export async function FamilyShell({
  children,
  active = "feed",
}: {
  children: ReactNode;
  active?: "feed";
}) {
  const currentUser = await getCurrentUser();
  return (
    <FeedProvider kids={[]} showModal={false}>
      <FamilyShellClient currentUser={currentUser} active={active}>
        {children}
      </FamilyShellClient>
    </FeedProvider>
  );
}