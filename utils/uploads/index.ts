import { join } from "node:path";
import { validateImageFile } from "./validation";
import { IMAGE_EXT_BY_MIME } from "./validation";
import { saveFileToBucket } from "./save";

export { UploadValidationError } from "./errors";
export {
  EXECUTABLE_EXTENSIONS,
  isExecutableExtension,
  safeExtensionFromMime,
  sanitizeFilename,
  validateFilename,
} from "./filename";
export {
  DEFAULT_IMAGE_MIME,
  IMAGE_EXT_BY_MIME,
  validateBatch,
  validateImageFile,
  validateMagicBytes,
  validateMime,
  validateSize,
} from "./validation";
export type { BatchOptions, ImageFileOptions } from "./validation";
export type { SaveFileOptions, SaveFileResult } from "./save";
export { saveFileToBucket } from "./save";

const BUCKET_DIR = join(process.cwd(), "public", "uploads", "posts");
const PUBLIC_PREFIX = "/uploads/posts";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function savePhotoToBucket(
  file: File,
): Promise<{ url: string }> {
  await validateImageFile(file, { maxBytes: MAX_PHOTO_BYTES });
  const { url } = await saveFileToBucket(file, {
    bucketDir: BUCKET_DIR,
    publicPrefix: PUBLIC_PREFIX,
    extensionByMime: IMAGE_EXT_BY_MIME,
  });
  return { url };
}