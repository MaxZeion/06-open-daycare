# OpenDayCare

App de guardería: feed de momentos, gestión de salas y de las familias vinculadas a cada niño. Next.js 16 (App Router) + Supabase (Auth, Postgres, RLS) + Resend (email transaccional). UI en español, estilo definido por las maquetas en `pantallas/`.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16.3 (App Router, Turbopack), React 19, Tailwind v4 |
| Auth y DB | Supabase (Postgres + Auth + RLS), `@supabase/ssr` + `@supabase/supabase-js` |
| Email | Resend (`resend` npm) desde Server Actions |
| Lenguaje | TypeScript estricto |
| Lint / formato | ESLint v9 (config Next) |

---

## Prerequisitos

- **Node.js** >= 20 (recomendado 22; el repo no fija versión, `package.json` declara `@types/node: ^20`).
- **npm** 10+ (o pnpm/yarn si prefieres, los scripts son los mismos).
- **Una cuenta de Supabase** con un proyecto creado ([supabase.com/dashboard](https://supabase.com/dashboard)). El proyecto real de OpenDayCare está en `nmwabdzrdjubhsupiflu` (region EU).
- **(Opcional) CLI de Supabase** si quieres aplicar migraciones o inspeccionar tablas desde la terminal — ver [`docs/...`](https://supabase.com/docs/guides/cli) y la sección [Autenticarse con el CLI de Supabase](#autenticarse-con-el-cli-de-supabase) más abajo.
- **(Opcional) Cuenta de Resend** con API key — solo necesaria si vas a enviar invitaciones reales a emails que no estén registrados en la sandbox de `onboarding@resend.dev`.

---

## Setup local paso a paso

### 1. Clonar e instalar dependencias

```bash
git clone <url-del-repo>
cd 06-open-daycare
npm install
```

### 2. Variables de entorno

Copia `.env.template` a `.env.local` (NO commitees `.env.local`, está en `.gitignore`):

```bash
cp .env.template .env.local
```

Rellena los valores:

| Variable | Dónde se consigue |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard del proyecto Supabase → **Settings** → **API** → `URL` (formato `https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Misma pantalla → `Publishable key` (con prefijo `sb_publishable_…`, NO la `anon` legacy ni la `service_role`) |
| `SUPABASE_DB_PASSWORD` | Dashboard → **Settings** → **Database** → "Database password" (la que se usa para `psql` y la CLI) |
| `RESEND_API_KEY` | [resend.com/api-keys](https://resend.com/api-keys) → crear key |

> **Reglas**: `NEXT_PUBLIC_*` son las únicas seguras para el cliente. La `service_role` / `secret` **nunca** debe vivir en `.env.local` — solo en jobs servidor-side confiables o en la configuración del MCP.

### 3. Aplicar migraciones a tu base

Esta repo **no** usa `supabase init` ni `supabase/config.toml`: las migraciones se aplican con el **MCP de Supabase** que tengas configurado en tu cliente (Claude Code, Cursor, etc.). Ordena los archivos por prefijo numérico (`01-`, `02-`, …) en `supabase/migrations/` y aplícalos en orden con la tool `apply_migration`. El listado de migraciones aplicadas vive en `supabase_migrations.schema_migrations`.

> Si prefieres usar la **CLI local** (ver siguiente sección): `supabase db push` no funciona aquí porque no hay `config.toml`. Para aplicar una migración específica vía CLI tendrías que enlazar primero el proyecto (`supabase link`) y luego ejecutar el SQL con `psql` usando la connection string del dashboard.

### 4. Levantar el dev server

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Si no tienes sesión, te redirige a `/login`. El usuario staff seed (`staff@opendaycare.com` / `staff1234`) está creado por la migración `02-create_users_enums_and_auth_trigger.sql`.

Para parar el server: `Ctrl+C`.

---

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Dev server con Turbopack en `:3000` |
| `npm run build` | Build de producción (`.next/`) |
| `npm run start` | Sirve el build de producción |
| `npm run lint` | ESLint sobre todo el repo (sin prettier) |

No hay test runner ni CI configurados — la verificación se hace con lint + build + flujo manual / Playwright + queries al MCP.

---

## Autenticarse con el CLI de Supabase

Si vas a usar la CLI (`supabase`) en vez del MCP, sigue estos pasos. La CLI está escrita en Go y se instala con Homebrew, scoop o el binario oficial:

```bash
# macOS (Homebrew)
brew install supabase/tap/supabase

# o binario directo
curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh
```

> Si la prefieres sin instalar nada global: `npx supabase …` ejecuta la misma CLI.

### 1. Login (vincula la CLI a tu cuenta)

```bash
supabase login
```

Esto abre el navegador para que autorices un **access token personal**. La CLI guarda el token en `~/.supabase/access-token` (macOS/Linux) o `%USERPROFILE%\.supabase\access-token` (Windows). Formas alternativas:

```bash
# si ya tienes un access token (Dashboard → Account → Access Tokens):
supabase login --token sbp_xxxxxxxxxxxxxxxxxxxx

# logout / limpiar token:
supabase logout
```

Tras `supabase login` la CLI ya sabe quién eres y a qué organizaciones perteneces. **Eso es "identificar mi equipo"**: tu usuario + las orgs/teams de Supabase a las que fuiste invitado.

### 2. Listar las organizaciones a las que tienes acceso

```bash
supabase orgs list
```

Salida tipo:

```
LOCAL   NAME              ID
   •    OpenDayCare       abcdefghijklmnopqrstu
```

Elige la org y guárdala como la "activa por defecto":

```bash
# por nombre
supabase config set org-name "OpenDayCare"

# o por ID
supabase config set org-id abcdefghijklmnopqrstu
```

### 3. Ver los proyectos de esa organización

```bash
supabase projects list
```

Salida tipo:

```
   REF                       NAME              REGION
•  nmwabdzrdjubhsupiflu      open-daycare      eu-west-1
```

El `REF` (sin prefijo `https://`) es el project_id que usa la CLI para apuntar a tu base. Cópialo.

### 4. Vincular este repo al proyecto (opcional, solo si usarás `db push` o branches)

```bash
supabase link --project-ref nmwabdzrdjubhsupiflu
```

Te pedirá la **database password** (la misma que `SUPABASE_DB_PASSWORD` en `.env.local`). Esto crea `supabase/.temp/<ref>` con las credenciales cacheadas para `db push`, `db reset`, etc.

> Este repo **no tiene** `supabase/config.toml`, así que `supabase db push` no funcionará aunque vincules — las migraciones se aplican con el MCP o con `psql` directo. Vincular sigue siendo útil para `supabase branches list`, `supabase orgs switch`, etc.

### 5. Cambiar de organización / proyecto en cualquier momento

```bash
supabase orgs switch <org_id>
supabase projects switch <project_ref>

# o interactivo
supabase orgs switch --interactive
supabase projects switch --interactive
```

### 6. Inspeccionar la base desde la terminal

Sin necesidad de `link`, puedes conectarte con la connection string del dashboard:

```bash
# la connection string está en Dashboard → Connect → "Transaction pooler" o "Direct"
psql "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
```

Equivalente con la CLI:

```bash
supabase db dump --project-ref nmwabdzrdjubhsupiflu --schema public > dump.sql
```

### 7. Logout (limpiar credenciales locales)

```bash
supabase logout
```

Si quieres borrar también el proyecto vinculado al repo:

```bash
supabase unlink
```

---

## Stack de Supabase en el código

Toda interacción con Supabase desde el código pasa por **`utils/supabase/`**:

- `client.ts` — `createBrowserClient` (singleton) para Client Components.
- `server.ts` — `createServerClient(cookieStore)` para Server Components, Server Actions y Route Handlers. Recibe `await cookies()` de `next/headers`. El `setAll` está envuelto en `try/catch` porque los Server Components no pueden escribir cookies.
- `middleware.ts` — refresca la sesión en cada request vía `auth.getClaims()` y devuelve los cache headers correctos.

El entry point `proxy.ts` (en la raíz, antes `middleware.ts` — Next.js 16 renombró la convención) instancia el helper y devuelve la respuesta.

Para identificar al usuario en servidor usa siempre `supabase.auth.getClaims()` (verifica firma JWT, no falsificable). **Nunca** `getSession()` para decisiones de autorización.

---

## Estructura del proyecto

```
06-open-daycare/
├── app/                     # Next.js App Router (rutas en español)
│   ├── activate/            # /activate — activación de padres (sin sesión)
│   ├── kids/[id]/           # /kids/:id — perfil de niño
│   ├── login/  /logout/
│   ├── feed/                # /
│   ├── _actions/            # Server Actions globales (auth)
│   ├── proxy.ts             # Next.js 16 proxy entry (antes middleware.ts)
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── kids/                # KidCard, LinkParentModal, ProfileClient, mapKid, …
│   ├── feed/                # PostCard, NewPostModal, …
│   └── shared/              # AppShell, icons, …
├── utils/
│   ├── email.ts             # sendInvitationEmail (Resend, server-only)
│   └── supabase/            # client.ts / server.ts / middleware.ts
├── types/
│   └── supabase.ts          # Tipos generados desde el schema real
├── supabase/migrations/     # 01..07*.sql — fuente de verdad del schema
├── pantallas/               # Maquetas HTML estáticas (.dc.html) — NO tocar
├── screenshots/             # Capturas históricas del estado de la UI
├── specs/                   # Specs numerados (NN-slug.md), fuente de verdad funcional
├── .opencode/agents/        # spec-verify.md (agente de verificación)
├── .agents/skills/          # /spec /spec-impl /supabase /supabase-postgres-best-practices
├── .mcp-playwright/         # Screenshots de verificación (.gitignore)
├── opencode.json            # Config de MCPs (supabase, playwright, context7)
├── proxy.ts                 # (símbolo al app/proxy.ts)
└── AGENTS.md                # Convenciones del proyecto (LÉEME primero)
```

Lee `AGENTS.md` antes de tocar nada — ahí están las convenciones de RLS, migraciones, naming, i18n, etc.

---

## Workflow de specs (Spec Driven Development)

El proyecto usa las skills de `/.agents/skills/`:

1. **`/spec`** — escribe un nuevo spec en `specs/NN-slug.md` con sus acceptance criteria.
2. **`/spec-impl`** — crea la rama `spec-NN-slug`, implementa paso a paso con revisión de diffs (jamás commitea solo; pide confirmación).
3. **`/spec-verify`** (o `/spec-verify 12`) — delega en el agente `spec-verify` (`.opencode/agents/spec-verify.md`) que clasifica cada criterio (CLI / código / patrones Next.js vía Context7 / visual vía Playwright + visión), corrige lo que falla, marca los checkboxes con evidencia y emite **APROBADO** o **PENDIENTE**.

Specs ya cerrados viven en `specs/01-…11-…md` con el status puesto en `Implementado`.

---

## Verificación rápida (lo mínimo antes de un PR)

```bash
npm run lint          # ESLint
npm run build         # Next build (Turbopack)
```

Añade una verificación manual del flujo implicado vía Playwright (MCP) si tocas UI, o un query al MCP de Supabase si tocas DB.

---

## Recursos

- [Next.js 16 docs](https://nextjs.org/docs) — `node_modules/next/dist/docs/` también se sirve en local.
- [Supabase docs](https://supabase.com/docs) + skill local `.agents/skills/supabase/`.
- [Resend docs](https://resend.com/docs).
- [Tailwind v4 docs](https://tailwindcss.com/docs).
- `AGENTS.md` del repo — la fuente de verdad de las convenciones.
