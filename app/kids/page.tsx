import { AppShell } from "@/components/shared/AppShell";
import { getCurrentUser } from "@/utils/supabase/auth";
import { KidsPageClient } from "./KidsPageClient";

export default async function Page() {
  await getCurrentUser("/kids");
  return (
    <AppShell active="kids">
      <KidsPageClient />
    </AppShell>
  );
}
