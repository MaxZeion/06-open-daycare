---
description: "Audita la DB de Supabase con el agente db-security-auditor: previene fugas entre niños/padres/guarderías por RLS mal configurado y aplica best practices de Supabase Postgres. Con `--apply` puede escribir y aplicar la migración tras confirmación."
agent: db-security-auditor
---

Audita $ARGUMENTS con el flujo del agente `db-security-auditor`:

- Si $ARGUMENTS es un path de migración (`supabase/migrations/08-create_posts.sql`), un diff (`git diff main...HEAD`) o un spec (`specs/02-kids-list-and-profile.md`) → revisión puntual.
- Si es `all`, `toda la db` o vacío → barrido completo de `supabase/migrations/` + DB live vía MCP, probando policies con role-switch (`authenticated` / `anon` con JWT simulado).
- Si es un tema concreto (`"¿los padres pueden ver posts de niños ajenos?"`) → grep + policies contrastadas con `../07-DB-Schema`.
- Si no se puede inferir, pregunta al usuario antes de leer.

## Modo `--apply`

Si $ARGUMENTS contiene la palabra `--apply`, el agente entra en modo aplicación: además de auditar, redacta una nueva migración en `supabase/migrations/NN-<slug>.sql`, muestra su contenido al usuario y, **solo tras confirmación explícita** (vía tool `question`), llama a `supabase_apply_migration`. Aplica las verificaciones del flujo de migraciones (RLS on/off, policies, índices, role-switch + drift check) tras aplicar.

Sin `--apply` (modo por defecto), el agente no edita archivos ni aplica migraciones — emite el informe con snippets de fix y paras.

Ejemplos:
- `/db-security-audit` → solo informe, alcance = toda la DB.
- `/db-security-audit spec-verify/08-hardening` → solo informe, sobre el spec 08.
- `/db-security-audit users --apply` → modo aplicación, redacta y aplica `08-harden_users_*.sql` tras confirmación.
- `/db-security-audit all --apply` → modo aplicación, una sola migración con todos los hallazgos, tras confirmación.

Carga siempre `.agents/skills/supabase` + `.agents/skills/supabase-postgres-best-practices`, resuelve Context7 una sola vez (`/supabase/supabase`), itera por categoría de check, prueba role-switch con `supabase_execute_sql` y emite los hallazgos en tabla con severidades (Critical / Warning / Info), `file:line` o `mcp://tabla.policy`, snippet SQL de fix propuesto y doc ref. Veredicto final: `OK`, `MEJORABLE` o `BLOQUEANTE`.