import { cookies } from "next/headers";
import { StaffShell } from "@/components/shared/StaffShell";
import {
  DEFAULT_FAMILY_NEXT,
  requireRole,
} from "@/utils/supabase/auth";
import { createClient } from "@/utils/supabase/server";
import { mapChild, type ChildrenRow, type RoomOption } from "@/app/(staff)/_components/kids/mapKid";
import { FeedPageClient } from "./_components/feed/FeedPageClient";

export default async function Page() {
  await requireRole("staff", DEFAULT_FAMILY_NEXT, "/");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: roomsData }, { data: childrenData }] = await Promise.all([
    supabase.from("rooms").select("id, name").order("name"),
    supabase
      .from("children")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ]);

  const rooms: RoomOption[] =
    (roomsData as { id: string; name: string }[] | null)?.map((room) => ({
      id: room.id,
      name: room.name,
    })) ?? [];

  const kids = ((childrenData as ChildrenRow[] | null) ?? []).map((row) =>
    mapChild(row, rooms),
  );

  return (
    <StaffShell active="feed" kids={kids}>
      <FeedPageClient />
    </StaffShell>
  );
}
