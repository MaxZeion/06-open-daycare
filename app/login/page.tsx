import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { LoginForm } from "./LoginForm";

interface LoginPageProps {
  searchParams: Promise<{ next?: string; reset?: string; error?: string }>;
}

function safeNextPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next: rawNext, reset, error } = await searchParams;
  const next = safeNextPath(rawNext);

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect(next);
  }

  return (
    <LoginForm
      next={next}
      resetOk={reset === "ok"}
      errorKey={error}
    />
  );
}
