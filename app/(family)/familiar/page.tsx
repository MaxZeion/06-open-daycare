import {
  DEFAULT_STAFF_NEXT,
  requireRole,
} from "@/utils/supabase/auth";
import { listFeedPostsForParent } from "@/utils/supabase/posts";
import { FamilyShell } from "@/components/shared/FamilyShell";
import { FamilyFeedEmptyState } from "@/app/(family)/_components/feed/FamilyFeedEmptyState";
import { FeedPageClient } from "@/app/(staff)/_components/feed/FeedPageClient";

export default async function Page() {
  const currentUser = await requireRole("parent", DEFAULT_STAFF_NEXT, "/familiar");
  const posts = await listFeedPostsForParent(currentUser);

  return (
    <FamilyShell active="feed">
      <FeedPageClient
        posts={posts}
        header={{ kind: "family", parentName: currentUser.fullName }}
        emptyState={posts.length === 0 ? <FamilyFeedEmptyState /> : undefined}
      />
    </FamilyShell>
  );
}
