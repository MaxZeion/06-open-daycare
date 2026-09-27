import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { ActivateForm } from "./ActivateForm";

export default async function ActivatePage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect("/");
  }

  return <ActivateForm />;
}
