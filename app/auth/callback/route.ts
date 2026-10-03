import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

const DEFAULT_NEXT = "/";
const LOGIN_ERROR_PATH = "/login";

function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return DEFAULT_NEXT;
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    const errorKey = type === "recovery" ? "recovery_link_invalid" : "auth_callback_failed";
    return NextResponse.redirect(
      new URL(`${LOGIN_ERROR_PATH}?error=${errorKey}`, origin),
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorKey =
      type === "recovery" ? "recovery_session_expired" : "auth_callback_failed";
    return NextResponse.redirect(
      new URL(`${LOGIN_ERROR_PATH}?error=${errorKey}`, origin),
    );
  }

  return NextResponse.redirect(new URL(next, origin));
}