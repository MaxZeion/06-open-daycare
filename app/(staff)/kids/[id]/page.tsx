import Link from "next/link";
import { cookies } from "next/headers";
import { StaffShell } from "@/components/shared/StaffShell";
import { ArrowLeftIcon } from "@/components/shared/icons";
import {
  DEFAULT_FAMILY_NEXT,
  requireRole,
} from "@/utils/supabase/auth";
import { createClient } from "@/utils/supabase/server";
import {
  avatarFor,
  formatDateInput,
  mapChild,
  relationshipToSpanish,
  tagsToInputText,
  type ChildrenRow,
  type Relationship,
  type RoomOption,
} from "@/app/(staff)/_components/kids/mapKid";
import type { Parent } from "@/app/(staff)/_components/kids/mockKids";
import { ProfileClient } from "./ProfileClient";

type ParentLinkRow = {
  id: string;
  relationship: Relationship;
  users: { id: string; full_name: string } | null;
};

type InvitationRow = {
  id: string;
  full_name: string;
  relationship: Relationship;
};

async function fetchParents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  childId: string,
): Promise<Parent[]> {
  const expiresNow = new Date().toISOString();
  const [{ data: linksData }, { data: invitationsData }] = await Promise.all([
    supabase
      .from("parent_children")
      .select("id, relationship, users ( id, full_name )")
      .eq("child_id", childId)
      .order("created_at", { ascending: true }),
    supabase
      .from("invitations")
      .select("id, full_name, relationship")
      .eq("child_id", childId)
      .eq("status", "pending")
      .gt("expires_at", expiresNow)
      .order("created_at", { ascending: true }),
  ]);

  const active: Parent[] = ((linksData as ParentLinkRow[] | null) ?? []).map(
    (link) => {
      const name = link.users?.full_name ?? "Padre";
      return {
        name,
        initials: name.charAt(0).toUpperCase(),
        ...avatarFor(link.users?.id ?? link.id),
        role: relationshipToSpanish(link.relationship),
        status: "activa" as const,
      };
    },
  );

  const pending: Parent[] = ((invitationsData as InvitationRow[] | null) ?? []).map(
    (invitation) => ({
      name: invitation.full_name,
      initials: invitation.full_name.charAt(0).toUpperCase(),
      ...avatarFor(invitation.id),
      role: relationshipToSpanish(invitation.relationship),
      status: "pendiente" as const,
      note: "invitación enviada",
    }),
  );

  return [...active, ...pending];
}

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
  await requireRole("staff", DEFAULT_FAMILY_NEXT, `/kids/${id}`);

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [{ data: childrenData }, { data: roomsData }] = await Promise.all([
    supabase
      .from("children")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase.from("rooms").select("id, name").order("name"),
  ]);

  const rooms: RoomOption[] =
    (roomsData as { id: string; name: string }[] | null)?.map((room) => ({
      id: room.id,
      name: room.name,
    })) ?? [];

  const kids = ((childrenData as ChildrenRow[] | null) ?? []).map((row) =>
    mapChild(row, rooms),
  );

  const kid = kids.find((item) => item.id === id) ?? null;

  const parents = kid ? await fetchParents(supabase, kid.id) : [];

  return (
    <StaffShell active="kids" kids={kids}>
      <div className="mx-auto w-full max-w-[820px] px-5 pt-8 pb-24 md:px-10 md:pt-[34px] md:pb-20">
        {kid ? (
          <ProfileClient
            kid={kid}
            parents={parents}
            rooms={rooms}
            initialEditValues={{
              fullName: childrenData
                ?.find((item) => item.id === kid.id)
                ?.full_name.trim() ?? kid.name,
              birthDate: formatDateInput(
                childrenData?.find((item) => item.id === kid.id)?.birth_date ?? "",
              ),
              roomId: childrenData?.find((item) => item.id === kid.id)?.room_id ?? kid.roomId,
              allergies: tagsToInputText(
                childrenData?.find((item) => item.id === kid.id)?.allergy_tags ?? [],
              ),
              medicalNotes:
                childrenData?.find((item) => item.id === kid.id)?.medical_notes ?? "",
            }}
            backHref={`/kids?room=${kid.roomId}`}
          />
        ) : (
          <NotFound />
        )}
      </div>
    </StaffShell>
  );
}
