import { UploadValidationError } from "./errors";

export const EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".ps1",
  ".sh",
  ".js",
  ".jar",
  ".scr",
  ".vbs",
  ".wsf",
  ".cpl",
  ".msi",
  ".com",
  ".php",
  ".asp",
  ".aspx",
  ".jsp",
  ".cgi",
  ".pl",
  ".py",
]);

export function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, "");
  const stripped = base.replace(/[\x00-\x1f<>:"|?*]/g, "").trim();
  const truncated = stripped.slice(0, 255);
  return truncated.length > 0 ? truncated : "archivo";
}

export function isExecutableExtension(name: string): boolean {
  const lower = name.toLowerCase();
  for (const ext of EXECUTABLE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

export function validateFilename(file: { name: string }): void {
  if (sanitizeFilename(file.name) !== file.name) {
    throw new UploadValidationError(
      `El nombre del archivo "${file.name}" contiene caracteres no permitidos.`,
    );
  }
  if (isExecutableExtension(file.name)) {
    throw new UploadValidationError(
      `La extensión del archivo "${file.name}" no está permitida por seguridad.`,
    );
  }
}

export function safeExtensionFromMime(
  mime: string,
  mapping: Record<string, string>,
): string {
  const ext = mapping[mime];
  if (!ext || ext.length === 0) {
    throw new UploadValidationError(
      `MIME "${mime}" no tiene extensión mapeada.`,
    );
  }
  if (/[/\\.]/.test(ext)) {
    throw new UploadValidationError(
      `La extensión derivada de "${mime}" no es segura.`,
    );
  }
  return ext;
}