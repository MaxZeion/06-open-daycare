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
- En `NewPostModal.tsx`: añadir reset completo al abrir el modal (no solo al publicar con éxito), forzando re-mount del `<form>` con `key={openCount}` para resetear también `useActionState` (sin `state.error` ni `isPending` colgados).
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
   - Añadir `const [openCount, setOpenCount] = useState(0);` y `useEffect([modalOpen])` que, si `modalOpen` es `true`, llama `setOpenCount(c => c + 1)` y `resetFields()`. **Posicionarlo antes de `function resetFields()`** (React hoisting admite function declarations referenciadas desde el cuerpo del effect).
   - Quitar la línea `resetFields();` del `useEffect([state])` de éxito (el re-mount del form vía `key` ya resetea todo).
   - Añadir `key={openCount}` al `<form>`.
4. `npm run lint`, `npm run typecheck`, `npm run build` exit 0. Sin nuevas dependencias.

## Acceptance criteria

- [ ] Subir una foto HEIC (`image/heic`) + una foto JPEG (`image/jpeg`) en la misma publicación → ambos previews aparecen, ambas se insertan en `post_photos`, los archivos servidos desde `/uploads/posts/<uuid>.<ext>` tienen extensiones `.heic` y `.jpg` respectivamente.
- [ ] Subir 2 fotos (cualquier combinación de formatos soportados), pulsar "Quitar" en una de ellas, publicar → en `post_photos` hay **solo 1 fila** para ese post (la quitada NO llega al servidor).
- [ ] Abrir el modal, seleccionar niños + escribir descripción + seleccionar fotos → pulsar "Cancelar" → reabrir el modal → todos los campos vacíos (sin niños seleccionados, descripción vacía, sin previews, sin `<p role="alert">` con `state.error` residual).
- [ ] Subir un archivo `.pdf` → la action devuelve `{ ok: false, error: 'La foto "nombre.pdf" no es un formato soportado (JPEG, PNG, WebP, GIF, HEIC, AVIF, BMP).' }` y el error se pinta en el `<p role="alert">` del modal.
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` exit 0.

## Decisions

- **Sí:** sincronizar `input.files` con React state vía `DataTransfer()` (no clear del input con `value = ""`). Permite añadir más archivos después de quitar uno sin perder los demás y mantiene el state como source of truth.
- **No:** fallback por extensión cuando `file.type` está vacío. La mayoría de navegadores modernos envían `file.type` correcto; los que no, muestran el error con el filename, que es accionable.
- **Sí:** reset al abrir el modal en lugar de solo al publicar con éxito. BUG detectado en uso real.
- **Sí:** `key={openCount}` en el `<form>` para forzar re-mount. `useActionState` (React 19) no expone API de reset; el key trick es la forma soportada.
- **No:** tocar `specs/16-posts-from-supabase.md` desde este spec. SPEC 16 está verificado y mergeado; los criterios de aceptación ya recogen el contrato (los formatos soportados se enumeran en este nuevo spec).
- **No:** ampliar el alcance a drag and drop o subida con `<input webkitdirectory>`. Sigue siendo un solo `<input type="file" multiple>` con `accept` ampliado.

## Risks

| Risk | Mitigation |
| --- | --- |
| `input.files = dt.files` no soportado en navegadores antiguos | Verificable en navegador moderno (Chrome 90+, Firefox 90+, Safari 14+). Si falla en algún target, fallback: reconstruir `formData` desde React state en `createPostAction` con un wrapper. |
| HEIC se sube pero no se renderiza en `<img>` del feed | `<img>` soporta HEIC en Safari nativo, Chrome con extensión HEIF, Firefox no. Aceptable para esta fase; conversión server-side queda como spec propio. |
| `setOpenCount` dentro de `useEffect` (warning de React sobre setState-in-effect) | El effect solo dispara cuando `modalOpen` cambia (no en cada render). Patrón equivalente al ya usado en este mismo archivo para `setAttempted` (`handleSubmit`) — sin warning. |

## What is **not** in this spec

- Reescalado o conversión HEIC→JPEG server-side.
- Drag and drop o subida con `<input webkitdirectory>`.
- Persistencia de borradores.
- Cambios en `PostCard`, `listFeedPosts`, ni en la DB / migración 16.
- Tocar `specs/16-posts-from-supabase.md`.
- Cualquier otro ajuste de SPEC 16 que no esté en los 3 fixes descritos.

Cada uno, si llega, va en su propio spec.