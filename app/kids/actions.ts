"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { parseSpanishDate } from "@/components/kids/dateMask";
import { isUuid, textToTags } from "@/components/kids/mapKid";

export interface AddKidState {
  error?: string;
  ok?: boolean;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function addKid(
  _prevState: AddKidState,
  formData: FormData,
): Promise<AddKidState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "").trim();
  const roomId = String(formData.get("room_id") ?? "").trim();
  const allergies = String(formData.get("allergies") ?? "");
  const medicalNotes = String(formData.get("medical_notes") ?? "").trim();

  if (fullName.length < 3) {
    return { error: "Introduce nombre y apellido (mínimo 3 caracteres en el nombre)." };
  }

  const parsedBirthDate = parseSpanishDate(birthDate);
  if (!parsedBirthDate) {
    return { error: "Fecha no válida." };
  }

  if (!isUuid(roomId)) {
    return { error: "Selecciona una sala válida." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("children").insert({
    full_name: fullName,
    room_id: roomId,
    birth_date: toIsoDate(parsedBirthDate),
    allergy_tags: textToTags(allergies),
    medical_notes: medicalNotes || null,
  });

  if (error) {
    return { error: "No se pudo guardar el niño. Inténtalo de nuevo." };
  }

  revalidatePath("/kids");
  return { ok: true };
}
