import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { safeExtensionFromMime } from "./filename";

export interface SaveFileOptions {
  bucketDir: string;
  publicPrefix: string;
  extensionByMime: Record<string, string>;
}

export interface SaveFileResult {
  url: string;
  filename: string;
}

export async function saveFileToBucket(
  file: File,
  options: SaveFileOptions,
): Promise<SaveFileResult> {
  const ext = safeExtensionFromMime(file.type, options.extensionByMime);
  const filename = `${randomUUID()}.${ext}`;
  const target = join(options.bucketDir, filename);

  await mkdir(options.bucketDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(target, buffer);

  return {
    url: `${options.publicPrefix}/${filename}`,
    filename,
  };
}