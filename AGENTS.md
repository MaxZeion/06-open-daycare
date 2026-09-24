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
- `specs/` aún no existe; el primero se crea con `/spec`.

## MCPS

- Playwright: screenshots y cualquier salida ha de ir en la carpeta `.mcp-playwright/` (ya está en .gitignore).
- Context7: úsalo para traer documentación actualizada del framework en lugar de confiar en el training data.

## Spec Driven Development

- /spec para espicificar las especificaciones
- /spec-impl para implementar las especificaciones

## Clean code

- Usaremos siempre las buenas prácticas, variables, funciones, etc todo en inglés