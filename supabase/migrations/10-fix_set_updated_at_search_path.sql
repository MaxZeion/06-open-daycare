-- supabase/migrations/10-fix_set_updated_at_search_path.sql
--
-- Micro-fix del lint `function_search_path_mutable` que introdujo la
-- migration 08 al crear `public.set_updated_at()` sin `set search_path`.
--
-- La función solo asigna `new.updated_at := now()` (no accede a tablas),
-- pero el linter de Supabase reporta `search_path` mutable como vector
-- potencial de hijack: si un atacante consigue crear un objeto llamado
-- `now()` en un schema anterior al `pg_catalog`, podría secuestrar la
-- resolución. `set search_path = ''` cierra todos los paneles menos los
-- garantizados del sistema (pg_catalog, pg_temp), eliminando el riesgo
-- sin cambiar la semántica.
--
-- Idempotente (CREATE OR REPLACE).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
  begin
    new.updated_at := now();
    return new;
  end;
$$;