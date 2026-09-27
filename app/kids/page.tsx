import { cookies } from "next/headers";
import { AppShell } from "@/components/shared/AppShell";
import { getCurrentUser } from "@/utils/supabase/auth";
import { createClient } from "@/utils/supabase/server";
import { mapChild, type ChildrenRow, type RoomOption } from "@/components/kids/mapKid";
import { KidsPageClient } from "./KidsPageClient";

type PageProps = {
  searchParams: Promise<{ room?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  await getCurrentUser("/kids");

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

  const { room } = await searchParams;
  const selectedRoomId = rooms.some((item) => item.id === room)
    ? (room as string)
    : (rooms[0]?.id ?? "");

  return (
    <AppShell active="kids" kids={kids}>
      <KidsPageClient rooms={rooms} kids={kids} selectedRoomId={selectedRoomId} />
    </AppShell>
  );
}
