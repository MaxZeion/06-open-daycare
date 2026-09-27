import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { ActivateForm } from "./ActivateForm";

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
  const initialCode = /^[A-Z0-9]{5}$/.test((code ?? "").toUpperCase())
    ? (code as string).toUpperCase()
    : undefined;

  return <ActivateForm initialCode={initialCode} />;
}
