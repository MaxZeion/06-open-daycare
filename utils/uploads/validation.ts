import { UploadValidationError } from "./errors";
import { validateFilename } from "./filename";

export const DEFAULT_IMAGE_MIME: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
]);

export const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

const HEIC_HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "mif1",
  "msf1",
]);

function bytesToAscii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[start + i]);
  }
  return out;
}

async function matchesDeclaredMime(
  file: File,
  declaredMime: string,
): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  switch (declaredMime) {
    case "image/jpeg":
      return (
        head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
      );
    case "image/png":
      return (
        head.length >= 8 &&
        head[0] === 0x89 &&
        head[1] === 0x50 &&
        head[2] === 0x4e &&
        head[3] === 0x47 &&
        head[4] === 0x0d &&
        head[5] === 0x0a &&
        head[6] === 0x1a &&
        head[7] === 0x0a
      );
    case "image/gif":
      return (
        head.length >= 4 &&
        head[0] === 0x47 &&
        head[1] === 0x49 &&
        head[2] === 0x46 &&
        head[3] === 0x38
      );
    case "image/webp":
      return (
        head.length >= 12 &&
        head[0] === 0x52 &&
        head[1] === 0x49 &&
        head[2] === 0x46 &&
        head[3] === 0x46 &&
        head[8] === 0x57 &&
        head[9] === 0x45 &&
        head[10] === 0x42 &&
        head[11] === 0x50
      );
    case "image/bmp":
      return head.length >= 2 && head[0] === 0x42 && head[1] === 0x4d;
    case "image/heic":
    case "image/heif": {
      if (head.length < 12) return false;
      const ftyp =
        head[4] === 0x66 &&
        head[5] === 0x74 &&
        head[6] === 0x79 &&
        head[7] === 0x70;
      if (!ftyp) return false;
      const brand = bytesToAscii(head, 8, 4);
      return HEIC_HEIF_BRANDS.has(brand);
    }
    case "image/avif": {
      if (head.length < 12) return false;
      const ftyp =
        head[4] === 0x66 &&
        head[5] === 0x74 &&
        head[6] === 0x79 &&
        head[7] === 0x70;
      if (!ftyp) return false;
      return bytesToAscii(head, 8, 4) === "avif";
    }
    default:
      return false;
  }
}

export interface ImageFileOptions {
  allowedMime?: ReadonlySet<string>;
  maxBytes?: number;
  verifyContent?: boolean;
}

export function validateMime(
  file: { name: string; type: string },
  allowedMime: ReadonlySet<string>,
): void {
  if (!allowedMime.has(file.type)) {
    throw new UploadValidationError(
      `La foto "${file.name}" no es un formato soportado (${[...allowedMime].join(", ")}).`,
    );
  }
}

export function validateSize(
  file: { name: string; size: number },
  maxBytes: number,
): void {
  if (file.size <= 0) {
    throw new UploadValidationError(`La foto "${file.name}" está vacía.`);
  }
  if (file.size > maxBytes) {
    throw new UploadValidationError(
      `La foto "${file.name}" supera el tamaño máximo (${(maxBytes / 1024 / 1024).toFixed(1)}MB).`,
    );
  }
}

export async function validateMagicBytes(
  file: File,
  declaredMime: string,
): Promise<boolean> {
  return matchesDeclaredMime(file, declaredMime);
}

export async function validateImageFile(
  file: File,
  options?: ImageFileOptions,
): Promise<void> {
  const allowedMime = options?.allowedMime ?? DEFAULT_IMAGE_MIME;
  const maxBytes = options?.maxBytes ?? 5 * 1024 * 1024;
  const verifyContent = options?.verifyContent ?? true;

  validateMime(file, allowedMime);
  validateFilename(file);
  validateSize(file, maxBytes);

  if (verifyContent) {
    const ok = await validateMagicBytes(file, file.type);
    if (!ok) {
      throw new UploadValidationError(
        `La foto "${file.name}" no parece un ${file.type} válido (contenido no reconocido).`,
      );
    }
  }
}

export interface BatchOptions {
  maxFiles?: number;
  maxTotalBytes?: number;
}

export function validateBatch(files: File[], options?: BatchOptions): void {
  const maxFiles = options?.maxFiles ?? 5;
  const maxTotalBytes = options?.maxTotalBytes ?? 25 * 1024 * 1024;

  if (files.length > maxFiles) {
    throw new UploadValidationError(
      `Máximo ${maxFiles} fotos (has subido ${files.length}).`,
    );
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > maxTotalBytes) {
    throw new UploadValidationError(
      `Las fotos suman ${(totalBytes / 1024 / 1024).toFixed(1)}MB; el máximo total es ${(maxTotalBytes / 1024 / 1024).toFixed(0)}MB.`,
    );
  }
}