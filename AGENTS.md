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

## Agentes

- **`spec-verify`** (`.opencode/agents/spec-verify.md`) — verifica `## Acceptance criteria` de un spec (CLI, código, Context7, Playwright + visión). Invocar con `/spec-verify [NN | slug | path]`.
- **`react-best-practices`** (`.opencode/agents/react-best-practices.md`) — auditor readonly de Next.js/React 19 en `app/`. Invocar con `/react-audit <path | "all">`.
- **`db-security-auditor`** (`.opencode/agents/db-security-auditor.md`) — auditor readonly de la DB de Supabase: previene fugas entre niños/padres/guarderías por RLS mal configurado y aplica las reglas de `.agents/skills/supabase-postgres-best-practices/`. Invocar con `/db-security-audit <path | "all" | tema | spec>`. **Usar antes de mergear cualquier spec que cree/modifique tablas, policies o funciones en `supabase/migrations/`**, o como gate de seguridad periódico (ej. `all`). El agente nunca aplica cambios — propone snippets y deja la decisión al usuario.

## Stack de Supabase en la app (Next.js)

Toda interacción con Supabase desde el código de la app va por estos paquetes. No importar `supabase-js` directo en páginas/componentes — solo a través de los helpers de `utils/supabase/`.

- **Paquetes:** `@supabase/supabase-js` (cliente) y `@supabase/ssr` (integración cookie-based para SSR). Versiones pinneadas en `package.json` + `package-lock.json` (no upgradear a mano).
- **Variables de entorno** (en `.env.local`, ignorado por git):
  - `NEXT_PUBLIC_SUPABASE_URL` — URL del proyecto (`https://<ref>.supabase.co`).
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — clave moderna con prefijo `sb_publishable_…`. Reemplaza a la legacy `anon` key; es segura para frontend. **Nunca** exponer la `service_role` / `secret` key — vive solo en el MCP y en jobs servidor-side confiables.
- **Helpers** (en `utils/supabase/`):
  - `client.ts` — `createClient()` para Client Components (usa `createBrowserClient`, singleton interno).
  - `server.ts` — `createClient(cookieStore)` para Server Components, Server Actions y Route Handlers. Pasarle `await cookies()` de `next/headers`. El `setAll` está envuelto en `try/catch` porque los Server Components no pueden escribir cookies (lo hace el proxy).
  - `middleware.ts` — helper `createClient(request)` que arma el cliente + response, llama `await supabase.auth.getClaims()` (refresco del token) y aplica los cache headers `Cache-Control` / `Expires` / `Pragma` que entrega `@supabase/ssr` en el segundo argumento de `setAll`. Devuelve `{ supabase, supabaseResponse }`.
- **Proxy entry point** — `proxy.ts` en la raíz exporta la función `proxy(request)` (Next.js 16 renombró `middleware.ts` → `proxy.ts`, ver `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Llama al helper de arriba y devuelve el `supabaseResponse`. Matcher por defecto excluye `_next/static`, `_next/image`, `favicon.ico` e imágenes para no correr en assets.
- **Reglas de uso:**
  - No crear instancias de `createBrowserClient` / `createServerClient` sueltas en páginas: siempre pasar por los helpers.
  - Crear un cliente nuevo por request en el servidor (no singleton). En el cliente `createBrowserClient` ya es singleton.
  - Para identificar al usuario en servidor usar `supabase.auth.getClaims()` (verifica firma del JWT, no falsificable desde la cookie). **Nunca** usar `getSession()` para decisiones de autorización — su `user` viene del cookie sin revalidar. `getUser()` solo cuando hace falta un record fresco del Auth server.
  - Multi-tenant: las policies usan `auth.uid()` contra `users.id`; el cruce con `daycare_id` ocurre en las policies. Hasta que llegue el spec de `users`/auth, `select` abierto a `authenticated` es aceptable (lo cubre RLS).
- **Tipos TypeScript:** regenerar con `supabase_generate_typescript_types` del MCP cuando cambie el esquema (suele coincidir con un cambio en `supabase/migrations/`). Guardar el output en `types/supabase.ts` y evitar tipos inline en páginas.
- **Cache:** cualquier response que escriba cookies (refresco de sesión) tiene que llevar `Cache-Control: private, no-store` o aplicar los cache headers del helper — sino un CDN puede servirle a otro usuario una sesión ajena.

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