// app/api/admin/create-staff/route.ts
//
// SPEC 13: endpoint para crear staff (staff o admin) en una guardería.
// Solo accesible por admins autenticados de esa misma guardería.
//
// Seguridad:
//   - Verificación de auth manual (no usa `getCurrentUser` que hace
//     `redirect()`, incompatible con un route handler JSON).
//   - Caller debe tener `role='admin'` y `daycare_id` matching el body.
//   - Email duplicado → 409.
//   - Creación via `service_role` con `email_confirm: true` (no requiere
//     confirmación manual; el admin está creando el user).
//
// Notas:
//   - El Auth Hook `before_user_created` (Edge Function) NO se ejecuta en
//     `auth.admin.createUser` — solo en signup público. Por eso podemos
//     pasar `daycare_id` + `role` directamente en `user_metadata`. El
//     trigger `handle_new_auth_user` (migration 13) los propaga a
//     `public.users` con `status='active'`.
//   - `SUPABASE_SERVICE_ROLE_KEY` debe estar en `.env.local`.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { CurrentUserRole } from "@/utils/supabase/types";

type CreateStaffBody = {
  email?: unknown;
  password?: unknown;
  full_name?: unknown;
  daycare_id?: unknown;
  role?: unknown;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function isCreateStaffRole(value: unknown): value is "staff" | "admin" {
  return value === "staff" || value === "admin";
}

export async function POST(request: Request) {
  // 1. Verificar caller autenticado y admin
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return NextResponse.json(
      { error: "No has iniciado sesión." },
      { status: 401 },
    );
  }

  const appMetadata = (claims.app_metadata ?? {}) as {
    daycare_id?: string;
    role?: CurrentUserRole;
  };
  if (appMetadata.role !== "admin") {
    return NextResponse.json(
      { error: "Solo los administradores pueden crear staff." },
      { status: 403 },
    );
  }

  // 2. Validar body
  let body: CreateStaffBody;
  try {
    body = (await request.json()) as CreateStaffBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const { email, password, full_name, daycare_id, role } = body;

  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 },
    );
  }
  if (typeof full_name !== "string" || !full_name.trim()) {
    return NextResponse.json(
      { error: "Nombre completo requerido." },
      { status: 400 },
    );
  }
  if (typeof daycare_id !== "string" || daycare_id !== appMetadata.daycare_id) {
    return NextResponse.json(
      { error: "Solo puedes crear staff en tu propia guardería." },
      { status: 403 },
    );
  }
  if (!isCreateStaffRole(role)) {
    return NextResponse.json(
      { error: "Rol inválido (debe ser 'staff' o 'admin')." },
      { status: 400 },
    );
  }

  // 3. Verificar que el email no exista ya
  const adminClient = createAdminClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing, error: listError } =
    await adminClient.auth.admin.listUsers({ email: normalizedEmail });
  if (listError) {
    return NextResponse.json(
      { error: "No se pudo verificar el email." },
      { status: 500 },
    );
  }
  if (existing && Array.isArray(existing.users) && existing.users.length > 0) {
    return NextResponse.json(
      { error: "Este email ya tiene una cuenta." },
      { status: 409 },
    );
  }

  // 4. Crear user via service_role. El Auth Hook `before_user_created` NO se
  // ejecuta aquí (solo aplica a signup público). El trigger
  // `handle_new_auth_user` (migration 13) crea el row en `public.users`
  // con `daycare_id` + `role` desde `raw_user_meta_data`.
  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        daycare_id,
        role,
        full_name: full_name.trim(),
      },
    });

  if (createError || !created?.user) {
    return NextResponse.json(
      { error: createError?.message ?? "No se pudo crear el usuario." },
      { status: 500 },
    );
  }

  return NextResponse.json({ user_id: created.user.id }, { status: 201 });
}