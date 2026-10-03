import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BUCKET_DIR = join(process.cwd(), "public", "uploads", "posts");
const PUBLIC_PREFIX = "/uploads/posts";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
]);

const EXT_BY_MIME: Record<string, string> = {
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

async function matchesDeclaredMime(file: File, declaredMime: string): Promise<boolean> {
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
      // ISO BMFF: bytes 4-7 son "ftyp", bytes 8-11 el major brand.
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
      const brand = bytesToAscii(head, 8, 4);
      return brand === "avif";
    }
    default:
      return false;
  }
}

export interface SavePhotoResult {
  url: string;
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export async function savePhotoToBucket(file: File): Promise<SavePhotoResult> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new UploadValidationError(
      `La foto "${file.name}" no es un formato soportado (JPEG, PNG, WebP, GIF, HEIC, AVIF, BMP).`,
    );
  }
  if (file.size <= 0) {
    throw new UploadValidationError("La foto está vacía.");
  }
  if (file.size > MAX_BYTES) {
    throw new UploadValidationError(
      `La foto ${file.name} supera 5MB (${(file.size / 1024 / 1024).toFixed(1)}MB).`,
    );
  }
  if (!(await matchesDeclaredMime(file, file.type))) {
    throw new UploadValidationError(
      `La foto "${file.name}" no parece un ${file.type} válido (contenido no reconocido).`,
    );
  }

  const ext = EXT_BY_MIME[file.type];
  const name = `${randomUUID()}.${ext}`;
  const target = join(BUCKET_DIR, name);

  await mkdir(BUCKET_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(target, buffer);

  return { url: `${PUBLIC_PREFIX}/${name}` };
}