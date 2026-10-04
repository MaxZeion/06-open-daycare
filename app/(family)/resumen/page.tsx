import {
  DEFAULT_STAFF_NEXT,
  requireRole,
} from "@/utils/supabase/auth";
import {
  listDailySummariesForParent,
  listParentChildren,
  todayEuropeMadrid,
} from "@/utils/supabase/daily-summaries";
import { listFeedPostsForParent } from "@/utils/supabase/posts";
import { FamilyShell } from "@/components/shared/FamilyShell";
import { FamilyDailySummaryClient } from "@/app/(family)/_components/resumen/FamilyDailySummaryClient";

function madridDateLabel(now: Date): string {
  const label = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Madrid",
  }).format(now);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function Page() {
  const currentUser = await requireRole("parent", DEFAULT_STAFF_NEXT, "/resumen");
  const date = todayEuropeMadrid();

  const [summaries, children, posts] = await Promise.all([
    listDailySummariesForParent(currentUser, date),
    listParentChildren(currentUser),
    listFeedPostsForParent(currentUser),
  ]);

  return (
    <FamilyShell active="summary">
      <FamilyDailySummaryClient
        summaries={summaries}
        linkedChildren={children}
        posts={posts}
        date={date}
        dateLabel={madridDateLabel(new Date())}
      />
    </FamilyShell>
  );
}
