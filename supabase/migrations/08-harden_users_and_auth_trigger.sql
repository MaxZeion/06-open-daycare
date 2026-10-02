-- supabase/migrations/08-harden_users_and_auth_trigger.sql
--
-- Endurecimiento de public.users + tabla adyacente tras la auditoría
-- del agente db-security-auditor (informe 2026-10-02 sobre la tabla usuarios).
--
-- Resuelve:
--   C1 - Policy users_select_authenticated usaba `using (true)`: cualquier
--        padre autenticado podía leer TODAS las filas de users (staff/admins
--        de cualquier daycare) → enumeración + blast radius a tablas hijas.
--   W1 - relforcerowsecurity = false en public.users → defensa en profundidad.
--   W2 - Funciones SECURITY DEFINER ejecutables por authenticated innecesario
--        (handle_new_auth_user).
--   I1 - Grants de tabla demasiado generosos para anon/authenticated.
--   I2 - Índice faltante en invitations.invited_by (FK usada por policies
--        futuras que endurecerán invitations).
--   I3 - Falta users.updated_at + trigger set_updated_at (spec db-schema).
--
-- NO resuelve (queda fuera del scope de SQL, requiere cambios de código):
--   C2 - El trigger handle_new_auth_user sigue leyendo raw_user_meta_data
--        para asignar role/daycare_id en el signup. Eso es un vector de
--        privilege escalation (cualquier signup público puede auto-asignarse
--        role='admin' del daycare que quiera). Solución: mover role/daycare_id
--        a raw_app_meta_data vía Auth Hook server-side o endpoint con
--        service_role. Spec aparte.
--   Derivado - El seed staff@opendaycare.com con password 'staff1234' es
--        trivial; reemplazar cuando exista flujo real de bootstrap de staff.

-- ========================================================================
-- I3: users.updated_at + trigger set_updated_at
-- ========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table public.users
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ========================================================================
-- W1: force row level security en public.users
-- ========================================================================

alter table public.users force row level security;

-- ========================================================================
-- C1: SELECT policy restrictiva sobre public.users
-- ========================================================================
-- Reemplaza `users_select_authenticated using (true)` por:
--   - El usuario autenticado ve su propia fila (id = auth.uid()).
--   - Un staff/admin ve todas las filas de su mismo daycare.
--   - Un parent NO ve las filas de otros (ni de staff de su daycare,
--     a menos que sea su propia fila) → resuelve la fuga de staff.
--
-- Patrón de auth.uid() envuelto en (select ...) para que Postgres lo evalúe
-- una vez por query, no por fila. La subquery contra public.users sobre el
-- propio uid + role in (staff,admin) hace de guarda de staff/admin; usa el
-- índice users_daycare_id_idx para resolver el join.

drop policy if exists users_select_authenticated on public.users;

create policy users_select_self_or_same_daycare_staff
  on public.users for select
  to authenticated
  using (
    id = (select auth.uid())
    or daycare_id = (
      select daycare_id from public.users
       where id = (select auth.uid())
         and role in ('staff', 'admin')
    )
  );

-- ========================================================================
-- W2: revoke execute en funciones SECURITY DEFINER innecesarias
-- ========================================================================
-- handle_new_auth_user solo la invoca el trigger como owner del schema
-- (postgres). Por defecto Postgres concede EXECUTE a PUBLIC para todas las
-- funciones nuevas; revertirlo evita que aparezca accesible vía RPC.

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated, service_role;

-- email_exists(text): la llama el cliente en app/kids/actions.ts:133 vía
-- supabase.rpc('email_exists', { p_email }) durante la creación de una
-- invitación, para evitar duplicar invitaciones al mismo email. MANTENEMOS
-- el grant a authenticated (dependencia de cliente activa) y dejamos el
-- lint del advisor de seguridad como aceptado hasta que se migre el chequeo
-- a un endpoint server-side con service_role.
--
-- Si en una migración futura se quiere endurecer: reemplazar el rpc del
-- cliente por un endpoint /api/invitations/check-email que use service_role
-- y revocar aquí el grant a authenticated.

-- validate_invitation / expire_invitation siguen ejecutables por anon
-- (necesario para /activate) y authenticated. Documentadas como excepciones
-- intencionales al lint `security_definer_view`.

-- ========================================================================
-- I1: grants de tabla sobre public.users
-- ========================================================================
-- anon no debe poder hacer NADA sobre la tabla. Sus únicas vías de acceso
-- son las SECURITY DEFINER documentadas (validate_invitation, expire_invitation).

revoke all on table public.users from anon;

-- authenticated solo necesita SELECT (la policy C1 lo acota por fila).
-- INSERT lo hace el trigger como owner; UPDATE/DELETE no hay policies hoy
-- y se mantienen denegados por defecto de RLS (refuerzo: revocar grants).

revoke insert, update, delete, trigger, references, truncate
  on table public.users from authenticated;

-- service_role conserva todos los grants (es server-side y debe bypasear
-- RLS para tareas administrativas como crear el primer admin).

-- ========================================================================
-- I2: índice en invitations.invited_by
-- ========================================================================
-- FK de invitations hacia users; cuando se endurezca la SELECT policy de
-- invitations con `invited_by = (select auth.uid())` o `staff_of_same_daycare`,
-- el join a users debe usar este índice.

create index if not exists invitations_invited_by_idx
  on public.invitations(invited_by);
