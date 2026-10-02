// utils/supabase/admin.ts
//
// Cliente de Supabase con `service_role`. SOLO server-side (route handlers,
// server actions, jobs). NUNCA importar desde componentes cliente ni exponer
// la key al bundle.
//
// Usa `SUPABASE_SERVICE_ROLE_KEY` (variable de entorno server-only, sin
// prefijo `NEXT_PUBLIC_`). Esta key bypasea RLS y tiene permisos totales
// sobre el proyecto. Mantener fuera del repo (.env.local está en
// .gitignore).
//
// El helper se usa solo desde código que verifica caller + autorización
// server-side (e.g. `/api/admin/create-staff`). Por sí mismo no valida nada;
// la seguridad del caller depende del route handler que lo invoca.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export const createAdminClient = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );