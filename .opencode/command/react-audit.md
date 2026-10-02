---
description: "Audita código React/Next.js con el agente react-best-practices. Pasa un path, un diff, o 'all' para revisar toda la carpeta app/."
agent: react-best-practices
---

Audita $ARGUMENTS con el flujo del agente `react-best-practices`:

- Si $ARGUMENTS es un path (`app/feed/page.tsx`) o un diff → revisión puntual.
- Si es `all`, `toda la app` o vacío → auditoría completa de `app/` (usar `explore` primero para mapear).
- Si no se puede inferir, pregunta al usuario antes de leer.

Resuelve Context7 una vez (`/websites/react_dev`), itera por concepto, contrasta con el código y emite el informe en tabla con severidades (Critical/Warning/Info), `file:line`, snippet de fix propuesto y doc ref. Veredicto final: `OK`, `MEJORABLE` o `BLOQUEANTE`.
