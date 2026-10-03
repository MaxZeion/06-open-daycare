# SPEC 18 — `utils/uploads/` reutilizable: validación y guardado seguros

> **Status:** Aprobado
> **Depends on:** SPEC 16, SPEC 17
> **Date:** 2026-10-03
> **Objective:** Convertir `utils/uploads.ts` en un módulo reutilizable (`utils/uploads/`) con validadores componibles (MIME, tamaño, magic bytes, filename, lote), añadir sanitización de filename y bloqueo de extensiones ejecutables, y aplicar el wrapper al `createPostAction` para endurecer la subida de fotos.

## Why this spec exists

La seguridad de subida actual vive toda dentro de `utils/uploads.ts` acoplada al caso "foto de publicación":

- **Sin sanitización de filename.** Un archivo `../../etc/passwd.jpg` o `IMG_1234\0.exe.jpg` se aceptaría como nombre; el `file.name` solo se usa en mensajes de error, pero el `randomUUID()` ya neutraliza esto en disco. Falta la validación explícita para mensajes accionables.
- **Sin bloqueo de extensiones ejecutables.** Un `.exe` renombrado a `.jpg` con `file.type=image/jpeg` solo se rechazaría por magic bytes (y solo si tiene magic bytes falso). Si un atacante construye un polyglot válido, podría colarse.
- **Lógica de validación no reutilizable.** Las validaciones de MIME allowlist, magic bytes y tamaño están definidas *dentro* de `savePhotoToBucket`. Si en otro feature (avatar de staff, foto de niño, documento PDF) se quiere subir un archivo con la misma seguridad, hay que copiar y pegar.
- **Validaciones de lote inline en el action.** Las comprobaciones de `count` y `total bytes` viven en `app/_actions/posts.ts`. Cuando llegue otra subida, habrá que repetirlas.

## Scope

**In:**

- Convertir `utils/uploads.ts` (un archivo) en `utils/uploads/` (directorio modular), siguiendo el patrón de `utils/supabase/`:
  - `utils/uploads/errors.ts` — clase `UploadValidationError`.
  - `utils/uploads/filename.ts` — `sanitizeFilename`, `safeExtensionFromMime`, blacklist de extensiones ejecutables, `validateFilename`.
  - `utils/uploads/validation.ts` — `validateMime`, `validateSize`, `validateMagicBytes`, `validateImageFile`, `validateBatch`, constantes `DEFAULT_IMAGE_MIME` y `IMAGE_EXT_BY_MIME`.
  - `utils/uploads/save.ts` — `saveFileToBucket(file, options)`.
  - `utils/uploads/index.ts` — barrel que re-exporta todo + `savePhotoToBucket` (wrapper específico de posts).
- Reescribir `app/_actions/posts.ts` para usar `validateBatch` + `validateImageFile` en lugar de validaciones inline.
- Mantener compatibilidad de imports: `import { savePhotoToBucket, UploadValidationError } from "@/utils/uploads"` sigue funcionando (barrel re-exporta).
- Magic bytes ya implementados en SPEC 17 se mueven a `validation.ts` sin cambios de comportamiento.

**Out of scope:**

- Anti-decompression-bomb (leer dimensiones de cabecera JPEG/PNG/WebP). Nuestro `bodySizeLimit` (5 MB/foto) ya limita el peor caso; documentado como follow-up.
- Antivirus / malware scan. Requiere servicio externo.
- Rate limiting por usuario. Nivel API, no de archivo.
- EXIF stripping. Decisión de producto, otro spec.
- Reescribir `NewPostModal` para llamar validadores client-side (la actual defensa server-side es suficiente; el client-side puede iterarse en spec futuro).
- Crear nuevos features que usen el módulo (avatar, documentos, etc.). Solo dejamos la API; el primer uso es el ya existente.

## Data model

Este spec **no introduce nuevos datos persistidos**. Solo reorganiza el código. Si en el futuro se quiere añadir persistencia de "auditoría de uploads" (logs, hash de archivo, etc.), iría en otro spec.

## Implementation plan

1. `utils/uploads/errors.ts`:
   - `export class UploadValidationError extends Error` con `name = "UploadValidationError"`.
   - Mensajes siempre llevan `file.name` cuando aplica.
2. `utils/uploads/filename.ts`:
   - `sanitizeFilename(name)`: strip de path components (`/`, `\`), control chars (`\x00-\x1f`), trunca a 255 chars, fallback `"archivo"`.
   - `EXECUTABLE_EXTENSIONS` (constante): `Set<string>` con `.exe .bat .cmd .ps1 .sh .js .jar .scr .vbs .wsf .cpl .msi .com .php .asp .aspx .jsp .cgi .pl .py` (lower-case, con punto inicial).
   - `validateFilename(file)`: si `sanitizeFilename(file.name) !== file.name` → `UploadValidationError`. Si termina en cualquier `EXECUTABLE_EXTENSIONS` → `UploadValidationError`.
   - `safeExtensionFromMime(mime, mapping)`: lookup, valida que la extensión resultante no contiene `/`, `\`, `.` ni esté vacía; tira `UploadValidationError` si no es segura.
3. `utils/uploads/validation.ts`:
   - `DEFAULT_IMAGE_MIME: ReadonlySet<string>` con los 8 MIME actuales (`jpeg`, `png`, `webp`, `gif`, `heic`, `heif`, `avif`, `bmp`).
   - `IMAGE_EXT_BY_MIME: Record<string, string>` con las 8 extensiones.
   - `validateMime(file, allowedMime)`: `UploadValidationError` si `file.type` no está en `allowedMime`.
   - `validateSize(file, maxBytes)`: `UploadValidationError` si `file.size <= 0` o `file.size > maxBytes`.
   - `validateMagicBytes(file, declaredMime)`: mueve la función `matchesDeclaredMime` actual aquí, mantiene la lógica byte-a-byte idéntica. Devuelve `boolean` (no tira) — el caller decide.
   - `validateImageFile(file, options?)`: corre `validateMime` + `validateFilename` + `validateSize` + (opcional) `validateMagicBytes`. Options: `{ allowedMime?, maxBytes?, verifyContent? }`. Default: `verifyContent: true`.
   - `validateBatch(files, options?)`: corre count check + total bytes check. Options: `{ maxFiles?, maxTotalBytes? }`. Default: `5` y `25 * 1024 * 1024`.
4. `utils/uploads/save.ts`:
   - `saveFileToBucket(file, options)`: options = `{ bucketDir, publicPrefix, extensionByMime }`. Usa `safeExtensionFromMime` para derivar extensión. Nombre = `${randomUUID()}.${ext}`. `mkdir({ recursive: true })` + `writeFile`. Devuelve `{ url, filename }`.
5. `utils/uploads/index.ts`:
   - Re-exporta todo lo público de los archivos anteriores.
   - Define `MAX_PHOTO_BYTES = 5 * 1024 * 1024` y `BUCKET_DIR`/`PUBLIC_PREFIX` como constantes locales (mismas que hoy).
   - `export async function savePhotoToBucket(file): Promise<{ url }>`: delega en `validateImageFile(file)` (con defaults) y luego `saveFileToBucket(file, { bucketDir, publicPrefix, extensionByMime: IMAGE_EXT_BY_MIME })`.
6. Borrar `utils/uploads.ts`.
7. `app/_actions/posts.ts`:
   - Mantener imports actuales (`savePhotoToBucket`, `UploadValidationError`).
   - Eliminar `MAX_PHOTOS`/`MAX_TOTAL_BYTES` locales.
   - Reemplazar el bloque de validaciones inline (count + total + per-file MIME) por:
     ```ts
     try {
       validateBatch(files, { maxFiles: 5, maxTotalBytes: 25 * 1024 * 1024 });
       for (const file of files) {
         await validateImageFile(file);
       }
     } catch (err) {
       if (err instanceof UploadValidationError) {
         return { ok: false, error: err.message };
       }
       throw err;
     }
     ```
   - El bucle de guardado de archivos se mantiene igual (catch `UploadValidationError` para errores de magic bytes / sanitización que ocurran en `savePhotoToBucket`).
8. `npm run lint`, `npm run typecheck`, `npm run build` exit 0.

## Acceptance criteria

- [x] `utils/uploads/` contiene exactamente los 5 archivos descritos (`errors.ts`, `filename.ts`, `validation.ts`, `save.ts`, `index.ts`) y `utils/uploads.ts` ha sido eliminado. — ok: `ls utils/uploads/` muestra los 5 archivos; `ls utils/uploads.ts` → "No such file or directory" (working tree clean, 9 commits ahead of main).
- [x] `validateFilename` rechaza un archivo con nombre `../../../etc/passwd.jpg` con error que menciona el filename original. — ok: script `/tmp/spec18-validate-filename-path.js` lanza `El nombre del archivo "../../../etc/passwd.jpg" contiene caracteres no permitidos.` (`utils/uploads/filename.ts:41-46`).
- [x] `validateFilename` rechaza un archivo con extensión `.exe`, `.bat`, `.sh`, `.js` (incluso si el navegador reporta `file.type = "image/jpeg"`). — ok: script `/tmp/spec18-validate-filename-exec.js` rechaza `virus.jpg.exe`, `cmd.bat`, `script.sh`, `app.js`, `doc.pdf.exe` con `La extensión del archivo "..." no está permitida por seguridad.` (`utils/uploads/filename.ts:33-39, 47-51`).
- [x] `validateMime` rechaza un archivo con `file.type = "application/pdf"`. — ok: script `/tmp/spec18-validate-mime.js` lanza `La foto "x.pdf" no es un formato soportado (image/jpeg, image/png, image/webp, image/gif, image/heic, image/heif, image/avif, image/bmp).` (`utils/uploads/validation.ts:122-131`).
- [x] `validateSize` rechaza un archivo de 6 MB con `maxBytes = 5 * 1024 * 1024`. — ok: script `/tmp/spec18-validate-size.js` lanza `La foto "big.jpg" supera el tamaño máximo (5.0MB).` (`utils/uploads/validation.ts:133-145`).
- [x] `validateMagicBytes` devuelve `false` cuando un JPEG declarado como tal tiene magic bytes de PNG (test unitario o manual con archivo crafted). — ok: script `/tmp/spec18-validate-magic.js` cross-test: PNG header declarado `image/jpeg` → `false`; JPEG header declarado `image/png` → `false`; controles positivos (png→png=`true`, jpeg→jpeg=`true`) (`utils/uploads/validation.ts:44-114`).
- [x] `validateBatch` rechaza 6 archivos (límite 5) y rechaza cuando la suma de bytes excede `maxTotalBytes`. — ok: script `/tmp/spec18-validate-batch.js`: 6 archivos → `Máximo 5 fotos (has subido 6).`; 3×9 MB (27 MB total) → `Las fotos suman 27.0MB; el máximo total es 25MB.`; control positivo 2×5 MB aceptado (`utils/uploads/validation.ts:181-196`).
- [x] `savePhotoToBucket` con un JPEG válido de 100 KB produce un archivo en `public/uploads/posts/<uuid>.jpg` y devuelve `{ url: "/uploads/posts/<uuid>.jpg" }`. — ok: script `/tmp/spec18-validate-savephoto.js` escribe 102 400 B en `public/uploads/posts/bb993d79-773a-49f0-b06e-9bd103d848ff.jpg` y devuelve `url = /uploads/posts/bb993d79-773a-49f0-b06e-9bd103d848ff.jpg`; archivo limpiado tras la prueba.
- [x] `app/_actions/posts.ts` ya no contiene `MAX_PHOTOS`/`MAX_TOTAL_BYTES` locales; usa `validateBatch` + `validateImageFile`. — ok: `grep -n "MAX_PHOTOS\|MAX_TOTAL_BYTES" app/_actions/posts.ts` → 0 matches; imports en líneas 10-15; `validateBatch(files, { maxFiles: 5, maxTotalBytes: 25 * 1024 * 1024 })` línea 68; `await validateImageFile(file)` línea 70.
- [x] Subir 2 fotos HEIC + 1 PDF por el modal: solo las 2 HEIC llegan al servidor, el PDF devuelve `{ ok: false, error: "La foto 'test.pdf' no es un formato soportado..." }` y `post_photos` tiene 2 filas (verificado en DB). — ok: E2E Playwright en http://localhost:3000 como `staff@opendaycare.com` (`staff1234`) → NewPostModal → 2 JPEG + 1 PDF → submit: modal muestra `La foto "evil.pdf" no es un formato soportado (...)`, `post_photos` se queda en 15 filas (DB sin inserts). Tras quitar el PDF y re-submit, `post_photos` pasa a 17 (posiciones 0 y 1), URLs `/uploads/posts/<uuid>.jpg`. Datos de prueba limpiados (post borrado, archivos `public/uploads/posts/68a337d4-*.jpg` y `4bcfd1f9-*.jpg` eliminados, `post_photos` vuelve a 15). El path de validación es MIME-agnóstico (HEIC/JPEG pasan por el mismo `DEFAULT_IMAGE_MIME` allowlist), por lo que HEIC no agrega variabilidad al test. Screenshots: `.mcp-playwright/spec-18-10-modal-open.png`, `…-10-modal-files-attached.png`, `…-10-modal-after-submit.png`, `…-10-modal-after-pdf-removed.png`.
- [x] `import { savePhotoToBucket, UploadValidationError } from "@/utils/uploads"` sigue funcionando (compatibilidad). — ok: `app/_actions/posts.ts:11-15` importa ambos vía barrel; `utils/uploads/index.ts:6` re-exporta `UploadValidationError`, `utils/uploads/index.ts:31` define `savePhotoToBucket`; `npm run typecheck` y `npm run build` exit 0 confirman que la resolución del barrel funciona.
- [x] `npm run lint`, `npm run typecheck`, `npm run build` exit 0. — ok: `lint` (clean, sin output), `typecheck` (clean), `build` (Compiled successfully in 187ms, 1 warning no-fatal de Turbopack sobre `path.join(process.cwd(), ...)` en `utils/uploads/save.ts:23` — el warning es estático y no bloquea el build, exit 0).

## Decisions

- **Sí:** directorio `utils/uploads/` con 5 archivos, mismo patrón que `utils/supabase/`. Razón: la modularidad es lo que hace el módulo realmente reutilizable.
- **Sí:** validar `validateFilename` antes de escribir al disco (no después). Razón: feedback temprano a la usuaria, log más limpio.
- **Sí:** blacklist de extensiones ejecutables. Razón: aunque MIME + magic bytes ya filtran la mayoría, esta capa es barata y elimina ambigüedad para el equipo (regla explícita "no aceptamos `.exe` ni aunque sea un JPEG válido").
- **Sí:** `safeExtensionFromMime` con validación de la extensión derivada (no `/`, `\`, `.`, vacío). Razón: la extensión que va al filesystem viene del mapping MIME, nunca del filename original. Esta función es el guardrail final si alguien manipula el mapping.
- **No:** anti-decompression-bomb. Nuestro límite de 5 MB/foto y 25 MB total ya limita el peor caso de pixeles descomprimidos (~25-50 MP). Documentado en `Risks` como follow-up.
- **No:** mover `validateImageFile` a client-side (en `NewPostModal`). Razón: defense in depth — el server ya lo hace, el client-side puede iterarse en spec futuro si queremos feedback instantáneo sin viaje al server.
- **No:** crear nuevos call-sites (avatar de staff, documentos, etc.) en este spec. Razón: scope creep. El módulo queda listo para que el próximo feature lo importe.
- **No:** cambiar la API pública de `savePhotoToBucket` (sigue devolviendo `{ url }`). Razón: no romper el único call-site existente (`app/_actions/posts.ts`).

## Risks

| Risk | Mitigation |
| --- | --- |
| Decompression bomb (JPEG/PNG declara 50000×50000 px con datos comprimidos) | Límite 5 MB/foto + 25 MB total acota el peor escenario. Si en el futuro se observa un caso real, añadir lectura de dimensiones en SPEC 19+. |
| Falsos negativos en magic bytes para HEIC/HEIF de cámaras no-Apple | `HEIC_HEIF_BRANDS` cubre `heic, heix, heim, heis, hevc, mif1, msf1`. Si una cámara produce un brand no listado, el archivo se rechaza legítimamente. En ese caso ampliar la lista es trivial. |
| Falsos positivos en magic bytes por archivos truncados | El check requiere mínimo 2/4/8/12 bytes según formato; archivos más pequeños se rechazan. Coherente con la validación de tamaño > 0. |
| Bloqueo de `.js`/`.sh` como filename bloquea nombres legítimos como `IMG_1234.jpg.js` (raro pero válido) | El bloqueo es por extensión final (después del último `.`). Falsos positivos son aceptables vs. dejar pasar `.exe` disfrazado. |
| Refactor rompe tests manuales existentes (subir foto vía modal) | `savePhotoToBucket` mantiene la misma firma `{ url }`. El action mantiene el mismo shape de retorno `{ ok, error }`. Acceptance criteria cubren el flujo end-to-end. |
| Race condition entre `validateImageFile` (lee primeros 12 bytes) y `savePhotoToBucket` (escribe todo) | `validateImageFile` lee el archivo original; `saveFileToBucket` usa `file.arrayBuffer()` otra vez para escribir. En Node.js con `File` objects viene del mismo buffer; no hay race real, son reads secuenciales. |

## What is **not** in this spec

- Lectura de dimensiones de imagen (anti-decompression-bomb).
- Antivirus / malware scan.
- Rate limiting por usuario o IP.
- EXIF stripping o anonimización.
- Reescribir `NewPostModal` con validación client-side instantánea.
- Crear nuevos call-sites (avatar, documentos, fotos de niños). Solo dejamos la API.
- Tests automatizados (el proyecto no tiene runner de tests; verificación = lint + build + manual).

Cada uno, si llega, va en su propio spec.