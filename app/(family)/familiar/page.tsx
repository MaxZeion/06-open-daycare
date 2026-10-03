import {
  DEFAULT_STAFF_NEXT,
  requireRole,
} from "@/utils/supabase/auth";
import { FamilyShell } from "@/components/shared/FamilyShell";
import { FeedPageClient } from "@/app/(staff)/_components/feed/FeedPageClient";

export default async function Page() {
  await requireRole("parent", DEFAULT_STAFF_NEXT, "/familiar");

  return (
    <FamilyShell active="feed">
      <FeedPageClient />
    </FamilyShell>
  );
}