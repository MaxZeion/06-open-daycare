# SPEC 06 — Español de España en toda la UI

> **Status:** Aprobado
> **Depends on:** SPEC 01 (feed), SPEC 02 (kids), SPEC 03 (login/activate), SPEC 04 (AddKidModal), SPEC 05 (LinkParentModal)
> **Date:** 2026-09-26
> **Objective:** Estandarizar todo el copy visible de la app, los mocks de datos, las maquetas de referencia y los specs a español de España (tuteo: "Introduce", "Activa", "Comparte"…), eliminando las formas voseantes argentinas que se filtraron desde el primer prototipo ("Ingresá", "Activá", "Compartí", "Revisá", "volvé", "tenés", "Completá", "Creá", "publicado por vos").

## Why this spec exists

El proyecto replica maquetas (`pantallas/*.dc.html`) que originalmente estaban escritas en voseo argentino. El código de la app y los mocks heredaron ese tono. La audiencia objetivo habla español de España, así que cada superficie (login, activate, feed, kids, perfil, modales, posts del feed) debe usar **2ª persona singular sin tilde diéritica en imperativos** ("Ingresa", "Activa", "Crea", "Comparte", "Revisa", "vuelve", "tienes", "Completa") y resolver el pronombre "vos" → "ti" en los textos reflexivos.

Es un trabajo mecánico de traducción pero **abarca más superficie de la que parece**: app (3 páginas + 2 modales), mocks (3 entradas de `POSTS`), 3 maquetas HTML y 4 specs que referencian el texto exacto. Centralizar el cambio en un spec dedicado evita perder algún string suelto y deja evidencia auditable.

## Scope

**In:**

- Sustitución 1:1 de las formas voseantes en el código de la app:
  - `app/login/page.tsx` — "Ingresá" → "Introduce", "Activá" → "Activa".
  - `app/activate/page.tsx` — "Creá" → "Crea", "¿Ya tenés cuenta?" → "¿Ya tienes cuenta?".
  - `app/page.tsx` — "Compartí un momento…" → "Comparte un momento…".
  - `app/kids/[id]/page.tsx` — "Revisá el enlace o volvé a la lista." → "Revisa el enlace o vuelve a la lista.".
  - `components/feed/mockPosts.ts` — `"publicado por vos"` → `"publicado por ti"` (×3).
  - `components/kids/LinkParentModal.tsx` — "Ingresá…" → "Introduce…" en los dos mensajes inline (nombre, email).
  - `components/kids/AddKidModal.tsx` — "Ingresá…" → "Introduce…" (nombre), "Completá la fecha…" → "Completa la fecha…" (fecha incompleta).
- Mismas sustituciones en `pantallas/login.dc.html`, `pantallas/activar-cuenta.dc.html` y `pantallas/feed.dc.html` (3 archivos).
- Actualización de los strings referenciados literalmente en specs:
  - `specs/01-feed-home.md` — comentario del modelo `publishedBy`.
  - `specs/03-login-and-activation.md` — 6 referencias a "Activá"/"tenés" en scope, implementation plan y acceptance criteria.
  - `specs/04-add-kid-modal.md` — mensajes de error del acceptance criterion (también alineado al mensaje actual del código: "Introduce nombre y apellido…").
  - `specs/05-link-parent-modal.md` — los dos mensajes inline nuevos.
- Verificación final con `grep -E "Ingresá|Activá|Creá|Compartí|Revisá|volvé|tenés|Completá|completá|publicado por vos" -r app/ components/ pantallas/ specs/` debe devolver 0 resultados.
- `npm run lint` y `npm run build` siguen verdes.

**Out of scope (para `spec-verify` o specs futuros):**

- Regeneración de la evidencia visual de SPEC 03 (`spec-03-login-desktop.png`, `spec-03-activate-desktop.png`, `spec-03-regression-*.png`). Los screenshots existentes muestran el copy anterior. El agente `spec-verify 03` contra esta rama se encarga.
- Regeneración de `spec-04-validation-errors.png` (también muestra el mensaje antiguo).
- Cambio del campo `publishedBy: string` (tipo/forma) — sólo cambia el literal del ejemplo.
- Cualquier retoque de copy que no sea voseo → tuteo (todo lo demás ya está en español neutro).
- i18n, pluralización, parámetros de género: el proyecto sigue 100% hardcoded en español de España.

## Tabla de traducciones (referencia auditable)

| Original (Argentina, voseo) | Destino (España, tuteo) | Archivos |
|---|---|---|
| `Ingresá para ver el día de hoy.` | `Introduce para ver el día de hoy.` | `app/login/page.tsx`, `pantallas/login.dc.html` |
| `Activá tu cuenta` | `Activa tu cuenta` | `app/login/page.tsx`, `pantallas/login.dc.html` |
| `…Creá tu contraseña para activar la cuenta.` | `…Crea tu contraseña para activar la cuenta.` | `app/activate/page.tsx`, `pantallas/activar-cuenta.dc.html` |
| `¿Ya tenés cuenta?` | `¿Ya tienes cuenta?` | `app/activate/page.tsx`, `pantallas/activar-cuenta.dc.html` |
| `Compartí un momento…` | `Comparte un momento…` | `app/page.tsx`, `pantallas/feed.dc.html` |
| `Revisá el enlace o volvé a la lista.` | `Revisa el enlace o vuelve a la lista.` | `app/kids/[id]/page.tsx` |
| `publicado por vos` (×3 en mocks, ×3 en maqueta, ×1 en spec) | `publicado por ti` | `components/feed/mockPosts.ts`, `pantallas/feed.dc.html`, `specs/01-feed-home.md` |
| `Ingresá nombre y apellido (mínimo 3 caracteres en el nombre).` | `Introduce nombre y apellido (mínimo 3 caracteres en el nombre).` | `components/kids/LinkParentModal.tsx`, `components/kids/AddKidModal.tsx`, `specs/05-link-parent-modal.md`, `specs/04-add-kid-modal.md` |
| `Ingresá un email válido.` | `Introduce un email válido.` | `components/kids/LinkParentModal.tsx`, `specs/05-link-parent-modal.md` |
| `Completá la fecha (dd/mm/aaaa).` | `Completa la fecha (dd/mm/aaaa).` | `components/kids/AddKidModal.tsx`, `specs/04-add-kid-modal.md` |

## Decisión: se rompen las maquetas (`pantallas/*.dc.html`)

`AGENTS.md` indica que las maquetas **no se editan**: son referencia de diseño servida por `pantallas/support.js`. En este spec se rompe esa regla de forma intencionada y localizada: las maquetas eran la fuente del copy voseante y, si la app pasa a tuteo, dejarlas intactas crearía dos problemas:

1. SPEC 03 (login/activate) tiene acceptance criteria que verifican "la app coincide con la maqueta". Tras este cambio, no coincidirían y el `spec-verify` fallaría aunque la app esté bien.
2. La evidencia visual `spec-03-mockup-{login,activate}-desktop.png` mostraría "Ingresá"/"Activá" como referencia canónica, induciendo a error en futuras revisiones.

**Por eso se actualizan maquetas + app + specs al mismo tiempo**, y el agente `spec-verify 03` tendrá que regenerar la evidencia tras el merge.

Si en el futuro vuelve a necesitar "no tocar maquetas", habrá que tratarlas como fuente de verdad y revertir la app a su copy — incompatible con este spec.

## Implementation plan

1. `git checkout main && git pull && git checkout -b spec-06-spanish-spain`.
2. App + componentes: 7 ediciones (tabla arriba). Sin cambios estructurales, sólo reemplazos de literal.
3. Maquetas: 3 ediciones en `pantallas/*.dc.html`. Sin tocar `pantallas/support.js`.
4. Specs: 4 ediciones en `specs/01-03-04-05-*.md`. Sólo referencias literales.
5. `grep -rE "Ingresá|Activá|Creá|Compartí|Revisá|volvé|tenés|Completá|completá|publicado por vos" app/ components/ pantallas/ specs/` → debe ser vacío.
6. `npm run lint && npm run build` → ambos exit 0.
7. Smoke con Playwright: abrir `/login`, `/activate`, `/`, `/kids`, `/kids/mateo-fernandez`, abrir LinkParentModal y submit vacío, abrir AddKidModal y submit vacío. Verificar que cada copy voseante está traducido y que los mensajes de error aparecen.
8. `git add`, commit, push, abrir PR (sin auto-merge).

## Acceptance criteria

- [ ] `grep -rE "Ingresá|Activá|Creá|Compartí|Revisá|volvé|tenés|Completá|completá|publicado por vos" app/ components/ pantallas/ specs/` devuelve **0** líneas.
- [ ] `npm run lint` y `npm run build` exit 0.
- [ ] Smoke visual: `/login`, `/activate`, `/` (feed con 3 cards), `/kids`, `/kids/mateo-fernandez` renderizan sin errores en consola y muestran el copy traducido.
- [ ] Smoke interactivo: en `/kids` → "Agregar niño" → Guardar con nombre `"a"` muestra **"Introduce nombre y apellido (mínimo 3 caracteres en el nombre)."**; con fecha incompleta muestra **"Completa la fecha (dd/mm/aaaa)."**.
- [ ] Smoke interactivo: en `/kids/mateo-fernandez` → "Vincular otro padre" → submit con nombre vacío muestra **"Introduce nombre y apellido (mínimo 3 caracteres en el nombre)."**; con email inválido muestra **"Introduce un email válido."**.
- [ ] Mock feed: en `/` los 3 posts muestran **"publicado por ti"** (no "publicado por vos").
- [ ] Login muestra "Introduce para ver el día de hoy." y el link "Activa tu cuenta".
- [ ] Activate muestra "¿Ya tienes cuenta?".
- [ ] El feed muestra el placeholder "Comparte un momento…" en la caja de composición.
- [ ] La pantalla `/kids/no-existe` muestra "Revisa el enlace o vuelve a la lista.".
- [ ] Maquetas y app coinciden carácter por carácter en los strings traducidos.

## Decisions

- **Sí:** imperativo directo 2ª persona singular sin tilde diéritica ("Ingresa", "Activa", "Crea", "Comparte", "Revisa", "vuelve", "Completa"). Coherente con el resto del español del proyecto (verbos en imperativo, sin "vos").
- **Sí:** romper la regla "no edites maquetas" en este spec (justificación arriba). Si en el futuro la regla vuelve a aplicarse, este spec queda documentado como la excepción.
- **Sí:** actualizar el SPEC 04 acceptance criterion para reflejar el mensaje real actual del código ("Introduce nombre y apellido…" en vez del antiguo "Ingresá el nombre completo."). El spec ya estaba desincronizado con el código por el SPEC 05 (endurecimiento de la validación), y este spec lo aprovecha para alinearlo.
- **No:** usar "vosotros" o plural de cortesía. El proyecto tutea al usuario singular en toda la UI.
- **No:** regeneración de screenshots. Queda para `spec-verify 03` (y, si aplica, `spec-verify 04` para `spec-04-validation-errors.png`).
- **No:** mover strings a un archivo de constantes i18n. El proyecto sigue 100% hardcoded.
- **No:** traducción de strings no voseantes (e.g. "Guardar", "Cancelar", "Volver a Niños" ya son neutros).

## Risks

| Risk | Mitigation |
| --- | --- |
| Olvidar algún string voseante en un archivo inesperado | Grep regex exhaustivo como acceptance criterion automatizable. Si queda alguno, el grep lo detecta. |
| Que el SPEC 03 (o 04) quede con evidencia visual desactualizada y `spec-verify` falle al comparar contra la maqueta | Tras merge, ejecutar `/spec-verify 03` y `/spec-verify 04` contra `main` para regenerar los screenshots y marcar de nuevo los criterios visuales. |
| Inconsistencia entre el mensaje del código y el del SPEC 04 (que ya estaba desincronizado antes de este spec) | SPEC 04 acceptance criterion actualizado al mensaje actual del código en este mismo spec. Verificado en el diff. |
| Alguien en el futuro agrega copy nuevo en voseo (porque "así estaba antes") | Convención documentada en este spec. La regla queda: "español de España, 2ª persona singular, sin voseo". |

## What is **not** in this spec

- i18n real, `next-intl`, archivos de traducción, pluralización.
- Reestructuración de carpetas de specs, renumeración, o fusión.
- Cambios de diseño visual, tokens, layout, animaciones, responsive.
- Regeneración de screenshots (queda para `spec-verify`).
- Persistencia, backend, autenticación real.

Cada uno, si llega, va en su propio spec.
