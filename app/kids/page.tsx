import { getCurrentUser } from "@/utils/supabase/auth";
import { KidsPageClient } from "./KidsPageClient";

export default async function Page() {
  await getCurrentUser("/kids");
  return <KidsPageClient />;
}
