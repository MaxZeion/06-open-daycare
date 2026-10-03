"use server";

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { MAP_KIND_UI_TO_DB } from "@/utils/supabase/posts";
import type { PostKind } from "@/app/(staff)/_components/feed/mockPosts";
import {
  savePhotoToBucket,
  UploadValidationError,
} from "@/utils/uploads";

const MAX_PHOTOS = 5;

export type CreatePostResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createPostAction(
  _prevState: CreatePostResult | undefined,
  formData: FormData,
): Promise<CreatePostResult> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) {
    return { ok: false, error: "No has iniciado sesión." };
  }
  if (claims.app_metadata?.role !== "staff") {
    return { ok: false, error: "No autorizado." };
  }

  const kindRaw = String(formData.get("kind") ?? "");
  const kind = (MAP_KIND_UI_TO_DB as Record<string, string>)[kindRaw]
    ? (kindRaw as PostKind)
    : null;
  if (!kind) {
    return { ok: false, error: "Tipo de publicación no válido." };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (body.length === 0) {
    return { ok: false, error: "Escribe una descripción." };
  }

  const allRoom = formData.get("allRoom") === "true";
  const childIds = formData
    .getAll("childIds")
    .map((value) => String(value))
    .filter((value) => value.length > 0);

  if (!allRoom && childIds.length === 0) {
    return {
      ok: false,
      error: "Selecciona al menos un niño o pulsa Toda la sala.",
    };
  }

  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File);

  if (files.length > MAX_PHOTOS) {
    return {
      ok: false,
      error: `Máximo ${MAX_PHOTOS} fotos (has subido ${files.length}).`,
    };
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "Solo imágenes." };
    }
  }

  const dbKind = MAP_KIND_UI_TO_DB[kind];

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({
      author_id: claims.sub,
      type: dbKind,
      body,
    })
    .select("id")
    .single();

  if (postError || !post) {
    return {
      ok: false,
      error: "No se pudo guardar la publicación. Inténtalo de nuevo.",
    };
  }

  if (childIds.length > 0) {
    const { error: childrenError } = await supabase
      .from("post_children")
      .insert(childIds.map((childId) => ({ post_id: post.id, child_id: childId })));

    if (childrenError) {
      await supabase.from("posts").delete().eq("id", post.id);
      return {
        ok: false,
        error: "No se pudo vincular la publicación a los niños. Inténtalo de nuevo.",
      };
    }
  }

  const uploadedUrls: string[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    try {
      const { url } = await savePhotoToBucket(file);
      uploadedUrls.push(url);

      const { error: photoError } = await supabase
        .from("post_photos")
        .insert({
          post_id: post.id,
          url,
          position: i,
        });

      if (photoError) {
        throw new Error(photoError.message);
      }
    } catch (err) {
      for (const url of uploadedUrls) {
        const filename = url.split("/").pop();
        if (!filename) continue;
        await unlink(join(process.cwd(), "public", url)).catch(() => {});
      }
      await supabase.from("posts").delete().eq("id", post.id);
      const message =
        err instanceof UploadValidationError
          ? err.message
          : "No se pudo subir la foto. Inténtalo de nuevo.";
      return { ok: false, error: message };
    }
  }

  revalidatePath("/");
  return { ok: true };
}