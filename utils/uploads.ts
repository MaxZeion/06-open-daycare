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

  const ext = EXT_BY_MIME[file.type];
  const name = `${randomUUID()}.${ext}`;
  const target = join(BUCKET_DIR, name);

  await mkdir(BUCKET_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(target, buffer);

  return { url: `${PUBLIC_PREFIX}/${name}` };
}