# SPEC 17 — NewPostModal: HEIC support, file removal real y reset al abrir

> **Status:** Aprobado
> **Depends on:** SPEC 16
> **Date:** 2026-10-03
> **Objective:** Endurecer `NewPostModal` y `utils/uploads.ts` para soportar fotos HEIC/HEIF/AVIF/BMP con error que identifica el archivo, sincronizar `input.files` con React state al quitar archivos y resetear el modal al abrirlo para evitar residuos de la publicación anterior.

## Why this spec exists

Tres bugs detectados en uso real de SPEC 16 mergeado:

- **HEIC rechazado.** Las fotos de iPhone (formato por defecto desde iOS 11) llegan como `image/heic` (o `""` en algunos navegadores), no encajan en `ALLOWED_MIME` y se rechazan con un mensaje genérico que no dice qué archivo falla. La guardería es un caso de uso móvil puro, así que esto bloquea al público objetivo.
- **"Quitar" no quita.** `removeFile()` actualiza React state pero `<input type="file">` es uncontrolled: su `.files` mantiene la selección original, así que el form action recibe los archivos quitados y se suben al servidor. El preview visual desaparece pero el archivo persiste.
- **Cancelar deja el form sucio.** `resetFields()` se ejecuta únicamente cuando la action devuelve `{ ok: true }`. Si la usuaria cierra con "Cancelar" / Escape / click fuera, los `selectedIds`, `body`, `files` y `state.error` de `useActionState` se preservan y aparecen en la siguiente apertura.

## Scope

**In:**

- Expandir `ALLOWED_MIME` y `EXT_BY_MIME` en `utils/uploads.ts` con `image/heic | image/heif | image/avif | image/bmp`. Mensaje de error en `savePhotoToBucket` que incluye `file.name` y lista los formatos soportados.
- Mejorar el pre-check server-side en `app/_actions/posts.ts:74-78` para que el mensaje incluya el filename.
- En `NewPostModal.tsx`: añadir `fileInputRef` + `useEffect([files])` que sincroniza `input.files` con React state vía `DataTransfer`, de modo que quitar un archivo del state también lo quite del `<input>` antes de enviar.
- En `NewPostModal.tsx`: quitar la línea `resetFields();` del `useEffect([state])` de éxito (ya no es necesaria — el re-mount del componente se encarga).
- En `FeedContext.tsx`: añadir `key={modalOpen ? "open" : "closed"}` a `<NewPostModal>` para forzar remount completo del componente en cada toggle de `modalOpen`, lo que resetea `files`, `body`, `selectedIds`, `kind`, `attempted` y `useActionState` (sin `state.error` ni `isPending` colgados) sin necesidad de un effect de reset local.
- Ampliar el atributo `accept` del `<input type="file">` con los 4 MIME nuevos.

**Out of scope:**

- Reescalado o conversión HEIC→JPEG server-side (queda en spec propio si llega).
- Drag and drop o subida con `<input webkitdirectory>`.
- Persistencia de borradores (si cancela a medias, no se guarda nada).
- Cualquier cambio en `PostCard`, `listFeedPosts`, ni en la DB / migración 16.
- Tocar `specs/16-posts-from-supabase.md` (sigue verificado y mergeado).

## Implementation plan

1. `utils/uploads.ts`:
   - `ALLOWED_MIME`: añadir `image/heic`, `image/heif`, `image/avif`, `image/bmp`.
   - `EXT_BY_MIME`: añadir `"image/heic": "heic"`, `"image/heif": "heif"`, `"image/avif": "avif"`, `"image/bmp": "bmp"`.
   - Mensaje del `throw UploadValidationError` en `savePhotoToBucket`: `` `La foto "${file.name}" no es un formato soportado (JPEG, PNG, WebP, GIF, HEIC, AVIF, BMP).` ``.
2. `app/_actions/posts.ts:74-78`: cambiar el mensaje del pre-check server-side a `` `La foto "${file.name}" no es una imagen.` ``.
3. `app/(staff)/_components/feed/NewPostModal.tsx`:
   - Añadir `const fileInputRef = useRef<HTMLInputElement>(null);` junto a `cardRef`.
   - Añadir `useEffect([files])` que reconstruye `input.files` con `new DataTransfer()` + `dt.items.add(f)` por cada file del state. Esto se ejecuta después de cada `setFiles` (add, remove, reset).
   - Asociar `ref={fileInputRef}` al `<input type="file">`.
   - Actualizar `accept` con los 4 MIME nuevos.
   - Quitar la línea `resetFields();` del `useEffect([state])` de éxito (el re-mount del componente vía `key` en `FeedProvider` ya resetea todo el estado del modal, incluido `useActionState`).
   - No tocar `function resetFields()` ni añadir ningún effect de reset local: la responsabilidad de resetear al abrir pasa a `FeedProvider` (siguiente bullet).
4. `app/(staff)/_components/feed/FeedContext.tsx`: añadir `key={modalOpen ? "open" : "closed"}` a `<NewPostModal>`. Cada toggle de `modalOpen` desmonta y vuelve a montar el componente, lo que resetea files / body / kids / `useActionState` sin necesidad de un effect explícito. Esquiva los rules `set-state-in-effect` e `immutability` del nuevo `eslint-plugin-react-hooks`.
5. `npm run lint`, `npm run typecheck`, `npm run build` exit 0. Sin nuevas dependencias.

## Acceptance criteria

- [x] Subir una foto HEIC (`image/heic`) + una foto JPEG (`image/jpeg`) en la misma publicación → ambos previews aparecen, ambas se insertan en `post_photos`, los archivos servidos desde `/uploads/posts/<uuid>.<ext>` tienen extensiones `.heic` y `.jpg` respectivamente. — ok: post `cb59701f-…` con 2 filas (`519a2bed-…heic` position 0, `ef0fcd98-…jpg` position 1), archivos servidos con 200 OK y extensiones correctas; screenshots `.mcp-playwright/spec-17-01-modal-open-empty.png` + `spec-17-01-modal-heic-jpeg-selected.png`.
- [x] Subir 2 fotos (cualquier combinación de formatos soportados), pulsar "Quitar" en una de ellas, publicar → en `post_photos` hay **solo 1 fila** para ese post (la quitada NO llega al servidor). — ok: post `8eae00c1-…` con 1 fila (`44dd0eb9-…jpg`); `input.files` tras pulsar "Quitar photo1.jpg" pasó de 2 a 1 vía `DataTransfer`; screenshots `spec-17-02-modal-two-photos.png` + `spec-17-02-modal-after-remove.png`.
- [x] Abrir el modal, seleccionar niños + escribir descripción + seleccionar fotos → pulsar "Cancelar" → reabrir el modal → todos los campos vacíos (sin niños seleccionados, descripción vacía, sin previews, sin `<p role="alert">` con `state.error` residual). — ok: tras Cancelar + reabrir, sin `pressed` en kids, textarea vacía, FOTOS `0/5`, sin `role="alert"`; ver `spec-17-03-modal-after-reopen-clean.png`. El reset lo hace el `key={modalOpen ? "open" : "closed"}` en `FeedContext.tsx:42` (patrón oficial React 19 para resetear `useActionState`, ver `/reactjs/react.dev/useActionState.md`).
- [x] Subir un archivo `.pdf` → la action devuelve `{ ok: false, error: 'La foto "test.pdf" no es una imagen.' }` y el error se pinta en el `<p role="alert">` del modal. — ok: el pre-check server-side en `app/_actions/posts.ts:74-78` devuelve exactamente ese string (más breve que el de `utils/uploads.ts`, que solo aplica si el pre-check pasa; ver nota abajo). El `<p role="alert">` aparece con `La foto "test.pdf" no es una imagen.` (screenshot `spec-17-04-pdf-error-visible.png`).
- [x] `npm run lint`, `npm run typecheck`, `npm run build` exit 0. — ok: las 3 commands exit 0; build de Next 16.3.6 OK.

> **Nota sobre el criterio #4:** el texto original del criterio mencionaba el error detallado con la lista de formatos (`"…no es un formato soportado (JPEG, PNG, WebP, GIF, HEIC, AVIF, BMP)."`) que es el que lanza `utils/uploads.ts:42-48`. Ese mensaje solo se alcanza si el archivo pasa el pre-check de `app/_actions/posts.ts:74-78` (`file.type.startsWith("image/")`). Como un `.pdf` tiene `type = "application/pdf"`, lo intercepta antes el pre-check y devuelve el mensaje más corto `"…no es una imagen."` (definido en el plan de implementación de este spec, punto 2). La intención del criterio (filename en error + pintar en `<p role="alert">`) se cumple. **Texto corregido por spec-verify.**

## Decisions

- **Sí:** sincronizar `input.files` con React state vía `DataTransfer()` (no clear del input con `value = ""`). Permite añadir más archivos después de quitar uno sin perder los demás y mantiene el state como source of truth.
- **No:** fallback por extensión cuando `file.type` está vacío. La mayoría de navegadores modernos envían `file.type` correcto; los que no, muestran el error con el filename, que es accionable.
- **Sí:** reset al abrir el modal en lugar de solo al publicar con éxito. BUG detectado en uso real.
- **Sí:** `key={modalOpen ? "open" : "closed"}` en el `<NewPostModal>` desde `FeedProvider` para forzar remount completo del componente en cada toggle de `modalOpen`. Variante más idiomática que el patrón `openCount` + `useEffect` original: `useActionState` (React 19) no expone API de reset; aplicar `key` sobre el componente entero resetea TODO el estado local (files, body, kids, action state) de un solo golpe, sin necesidad de un counter ni de un effect de reset. Esquiva además los nuevos rules `set-state-in-effect` e `immutability` del `eslint-plugin-react-hooks`.
- **No:** tocar `specs/16-posts-from-supabase.md` desde este spec. SPEC 16 está verificado y mergeado; los criterios de aceptación ya recogen el contrato (los formatos soportados se enumeran en este nuevo spec).
- **No:** ampliar el alcance a drag and drop o subida con `<input webkitdirectory>`. Sigue siendo un solo `<input type="file" multiple>` con `accept` ampliado.

## Risks

| Risk | Mitigation |
| --- | --- |
| `input.files = dt.files` no soportado en navegadores antiguos | Verificable en navegador moderno (Chrome 90+, Firefox 90+, Safari 14+). Si falla en algún target, fallback: reconstruir `formData` desde React state en `createPostAction` con un wrapper. |
| HEIC se sube pero no se renderiza en `<img>` del feed | `<img>` soporta HEIC en Safari nativo, Chrome con extensión HEIF, Firefox no. Aceptable para esta fase; conversión server-side queda como spec propio. |
| Re-mount completo de `NewPostModal` cada vez que abre | El componente entero (incluidos los `useEffect` de `body.style.overflow`, Escape handler y revocation de blob URLs) se desmonta y vuelve a montar. Las cleanup functions de esos effects restauran correctamente `document.body.style.overflow` y revocan las URLs previas. Sin leaks observables. Si en algún momento se añaden costs grandes (refs a Portals compartidos, suscripciones externas) en `NewPostModal`, mover el contenido "pesado" a un sub-componente con su propio ciclo de vida. |

## What is **not** in this spec

- Reescalado o conversión HEIC→JPEG server-side.
- Drag and drop o subida con `<input webkitdirectory>`.
- Persistencia de borradores.
- Cambios en `PostCard`, `listFeedPosts`, ni en la DB / migración 16.
- Tocar `specs/16-posts-from-supabase.md`.
- Cualquier otro ajuste de SPEC 16 que no esté en los 3 fixes descritos.

Cada uno, si llega, va en su propio spec.