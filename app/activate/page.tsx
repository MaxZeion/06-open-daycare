import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { ActivateForm, type InvitationPreview } from "./ActivateForm";

type PageProps = {
  searchParams: Promise<{ code?: string }>;
};

export default async function ActivatePage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect("/");
  }

  const { code } = await searchParams;
  const upper = (code ?? "").toUpperCase();
  const initialCode = /^[A-Z0-9]{5}$/.test(upper) ? upper : undefined;

  let preview: InvitationPreview | undefined;
  if (initialCode) {
    const { data: rows } = await supabase.rpc("validate_invitation", {
      p_code: initialCode,
    });
    const invite = (rows as Array<{
      child_id: string;
      child_full_name: string;
      room_name: string | null;
    }> | null)?.[0];
    if (invite) {
      preview = {
        childName: invite.child_full_name,
        roomName: invite.room_name ?? undefined,
        childId: invite.child_id,
      };
    }
  }

  return <ActivateForm initialCode={initialCode} preview={preview} />;
}
