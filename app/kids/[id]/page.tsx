import Link from "next/link";
import { cookies } from "next/headers";
import { AppShell } from "../../../components/shared/AppShell";
import { ArrowLeftIcon } from "../../../components/shared/icons";
import { getCurrentUser } from "@/utils/supabase/auth";
import { createClient } from "@/utils/supabase/server";
import { isUuid, mapChild, type ChildrenRow, type RoomOption } from "@/components/kids/mapKid";
import { ProfileClient } from "./ProfileClient";

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[16px] border border-border bg-surface px-6 py-16 text-center">
      <p className="font-display text-[22px] font-semibold text-ink">
        No encontramos a este niño
      </p>
      <p className="text-[15px] text-muted">
        Revisa el enlace o vuelve a la lista.
      </p>
      <Link
        href="/kids"
        className="mt-2 flex items-center gap-2 text-[14px] font-bold text-accent"
      >
        <ArrowLeftIcon className="h-[18px] w-[18px]" />
        Volver a Niños
      </Link>
    </div>
  );
}

export default async function KidProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getCurrentUser(`/kids/${id}`);

  if (!isUuid(id)) {
    return (
      <AppShell active="kids">
        <div className="mx-auto w-full max-w-[820px] px-5 pt-8 pb-24 md:px-10 md:pt-[34px] md:pb-20">
          <NotFound />
        </div>
      </AppShell>
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: childData }, { data: roomsData }] = await Promise.all([
    supabase.from("children").select("*").eq("id", id).eq("status", "active").maybeSingle(),
    supabase.from("rooms").select("id, name").order("name"),
  ]);

  const rooms: RoomOption[] =
    (roomsData as { id: string; name: string }[] | null)?.map((room) => ({
      id: room.id,
      name: room.name,
    })) ?? [];

  const row = childData as ChildrenRow | null;
  const kid = row ? mapChild(row, rooms) : null;

  return (
    <AppShell active="kids">
      <div className="mx-auto w-full max-w-[820px] px-5 pt-8 pb-24 md:px-10 md:pt-[34px] md:pb-20">
        {kid ? (
          <ProfileClient kid={kid} backHref={`/kids?room=${kid.roomId}`} />
        ) : (
          <NotFound />
        )}
      </div>
    </AppShell>
  );
}
