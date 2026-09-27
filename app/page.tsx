import { getCurrentUser } from "@/utils/supabase/auth";
import { FeedPageClient } from "./feed/FeedPageClient";

export default async function Page() {
  await getCurrentUser("/");
  return <FeedPageClient />;
}
