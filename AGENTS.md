<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Proyecto

OpenDayCare — app de guardería. App Router en `app/` (aún es el scaffold de create-next-app). La UI es en español y el diseño (colores crema/terracota, fuentes Fredoka + Nunito) se define en las maquetas, no en este repo.

## Comandos

- `npm run dev` — dev server (http://localhost:3000)
- `npm run build` — build de producción
- `npm run lint` — ESLint
- No hay runner de tests ni CI. Verificación = `lint` + `build`.

## Referencia de diseño

- `pantallas/*.dc.html` — maquetas HTML estáticas de cada pantalla (feed, publicación, perfiles, cuenta, etc.). Léelas para replicar layout/estilo; **no las edites** y no las trates como código de la app. `pantallas/support.js` solo las sirve.
- `screenshots/*.png` — capturas del estado de implementación anterior.

## Flujo de trabajo (specs)

- Feature importante → skill `/spec` (diseña el spec, lo guarda en `specs/NN-slug.md`).
- Spec aprobada → skill `/spec-impl` (rama `spec-NN-slug`, pasos con revisión de diff, **nunca commitea solo**).
- Spec implementada → comando `/spec-verify [NN | slug | path]` (ej. `/spec-verify 01`), que delega en el **agente `spec-verify`** (`.opencode/agents/spec-verify.md`): clasifica cada criterio de aceptación (CLI, código, patrones Next.js vía Context7, visual vía Playwright + visión), corrige lo que falla, marca los checkboxes con evidencia y emite el veredicto (**APROBADO** / **PENDIENTE**).
- Estado actual: `specs/01-feed-home.md` (feed home) implementado y verificado.

## MCPS

- Playwright: screenshots y cualquier salida ha de ir en la carpeta `.mcp-playwright/` (ya está en .gitignore).
- Context7: úsalo para traer documentación actualizada del framework en lugar de confiar en el training data.
- Supabase: MCP remoto (project ref `nmwabdzrdjubhsupiflu`). Úsalo para inspeccionar tablas, ejecutar SQL de consulta, **aplicar migraciones**, revisar advisors (seguridad/rendimiento) y logs. Para el esquema objetivo de la app, mira la referencia `docs` (`../07-DB-Schema`); lo que hay en la DB actual se comprueba con `list_tables`. La migración aplicada queda registrada en `supabase_migrations.schema_migrations` (`name`, `version`, `statements[]`). **Ver `## Migraciones de base de datos` más abajo para la convención de carpeta (`supabase/migrations/`), nomenclatura (`NN-<slug>.sql` ↔ `apply_migration` `NN_<slug>`) y el flujo completo de 6 pasos.**

## Skills de Supabase

- `supabase` (`.agents/skills/supabase/`) — carga cualquier tarea que involucre Supabase: Database, Auth, Edge Functions, Realtime, Storage, RLS, CLI, integración con Next.js (`@supabase/ssr`), troubleshooting y logs.
- `supabase-postgres-best-practices` (`.agents/skills/supabase-postgres-best-practices/`) — carga ANTES de escribir/cambiar algo que viva en la DB: tablas, migraciones, RLS, índices, funciones, queries lentas.

## Spec Driven Development

- /spec para espicificar las especificaciones
- /spec-impl para implementar las especificaciones
- /spec-verify para verificar los acceptance criteria (delega en el agente `spec-verify`, `.opencode/agents/spec-verify.md`)
- Specs que tocan DB → ver `## Migraciones de base de datos` antes de redactar el plan.

## Migraciones de base de datos

Las migraciones viven en **`supabase/migrations/`** y se aplican con el MCP de Supabase (`apply_migration`). La fuente de verdad es el archivo del repo; el MCP no debe usarse para DDL/DML que no exista también como `.sql` versionado.

### Nomenclatura

- **Archivo:** `supabase/migrations/NN-<slug>.sql`
  - `NN` = contador secuencial de dos dígitos (`01`, `02`, `03`, …). El siguiente spec que añada una migración mira el último `NN` existente en `supabase/migrations/` y suma uno.
  - `slug` = snake_case descriptivo (ej. `create_daycares_and_rooms`).
  - Termina con `\n` final (POSIX). Supabase descarta ese newline al almacenar en `supabase_migrations.schema_migrations.statements[]`; es esperado, no es drift.
- **Nombre en `apply_migration`:** `NN_<slug>` en snake_case (ej. `01_create_daycares_and_rooms`). Coincide con el nombre del archivo, guion por guion bajo.

### Flujo al implementar un spec que toca DB

1. Crear/editar `supabase/migrations/NN-<slug>.sql` con el SQL del spec (DDL + policies + seeds si aplica).
2. Aplicar con `apply_migration` del MCP pasando el mismo SQL del archivo, byte-idéntico.
3. Verificar con queries al MCP:
   - `list_tables` (columnas, PK, FK, RLS, conteos).
   - `pg_class.relrowsecurity` para confirmar RLS on.
   - `pg_policy` para confirmar nº y tipo (`r`/`i`/`u`/`d`) de policies.
   - `pg_indexes` para índices custom.
   - Role-switch (`set local role anon` / `authenticated`) cuando el criterio de aceptación lo requiera.
4. Drift check: comparar el contenido del archivo con `statements[0]` del registro en `supabase_migrations.schema_migrations` (modulo el newline final). Sin drift = sin cambios manuales sobre la DB.
5. `npm run lint` y `npm run build` siguen verdes (el spec de DB no toca código de la app).
6. Commit + PR en la rama del spec.

### Convenciones de schema (aplican salvo que el spec justifique lo contrario)

- PK `id uuid primary key default gen_random_uuid()` (usa `extensions.pgcrypto`, ya instalada).
- Timestamps: `created_at timestamptz not null default now()`. `updated_at` solo cuando haya caso de uso real y su trigger `set_updated_at` correspondiente.
- Identificadores, enums y códigos en **inglés** en DB. La UI traduce a español (SPEC 06).
- RLS **activado por defecto** en tablas nuevas (lo fuerza el proyecto). Policies restrictivas por defecto; abrir `select` a `authenticated` es aceptable mientras no exista auth. Endurecer cuando llegue el spec de `users`/auth (multi-tenant por `daycare_id`).
- Seeds fundación (ej. "Guardería Sala Soles" + sus salas) viajan **dentro de la migración**, no en `supabase/seed.sql` separado — son parte de la unidad lógica y garantizan reproducibilidad.
- Cada spec justifica en su sección **Decisions** cualquier desviación de estas convenciones.

## Clean code

- Usaremos siempre las buenas prácticas, variables, funciones, etc todo en inglés