"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/utils/supabase/auth";
import { sendInvitationEmail } from "@/utils/email";
import { parseSpanishDate } from "@/app/(staff)/_components/kids/dateMask";
import {
  isUuid,
  spanishToRelationship,
  textToTags,
  validateFullName,
  type Relationship,
} from "@/app/(staff)/_components/kids/mapKid";

export interface AddKidState {
  error?: string;
  ok?: boolean;
}

export interface UpdateKidState {
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

  const nameError = validateFullName(fullName);
  if (nameError) {
    return { error: nameError };
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

export async function updateKid(
  _prevState: UpdateKidState,
  formData: FormData,
): Promise<UpdateKidState> {
  const childId = String(formData.get("child_id") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "").trim();
  const roomId = String(formData.get("room_id") ?? "").trim();
  const allergies = String(formData.get("allergies") ?? "");
  const medicalNotes = String(formData.get("medical_notes") ?? "").trim();

  if (!isUuid(childId)) {
    return { error: "Niño no válido." };
  }

  const nameError = validateFullName(fullName);
  if (nameError) {
    return { error: nameError };
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

  const { data, error } = await supabase
    .from("children")
    .update({
      full_name: fullName,
      room_id: roomId,
      birth_date: toIsoDate(parsedBirthDate),
      allergy_tags: textToTags(allergies),
      medical_notes: medicalNotes || null,
    })
    .eq("id", childId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: "No se pudo guardar el niño. Inténtalo de nuevo." };
  }

  if (!data) {
    return { error: "Niño no válido." };
  }

  revalidatePath("/kids");
  revalidatePath(`/kids/${childId}`);
  return { ok: true };
}

const INVITE_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 5;
const CODE_MAX_ATTEMPTS = 3;

export interface InviteParentState {
  error?: string;
  ok?: boolean;
}

function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

export async function inviteParent(
  _prevState: InviteParentState,
  formData: FormData,
): Promise<InviteParentState> {
  const user = await getCurrentUser();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const relationshipLabel = String(formData.get("relationship") ?? "").trim();
  const childId = String(formData.get("child_id") ?? "").trim();

  const nameError = validateFullName(fullName);
  if (nameError) {
    return { error: nameError };
  }

  if (!INVITE_EMAIL_RE.test(email)) {
    return { error: "Introduce un email válido." };
  }

  const relationship = spanishToRelationship(relationshipLabel);
  if (!relationship) {
    return { error: "Selecciona un parentesco válido." };
  }

  if (!isUuid(childId)) {
    return { error: "Niño no válido." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: child } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("id", childId)
    .maybeSingle();

  if (!child) {
    return { error: "Niño no válido." };
  }

  const { data: alreadyRegistered } = await supabase.rpc("email_exists", {
    p_email: email,
  });
  if (alreadyRegistered) {
    return {
      error: "Este email ya tiene una cuenta. Pídele que inicie sesión.",
    };
  }

  const { data: pendingInvitation } = await supabase
    .from("invitations")
    .select("id")
    .eq("child_id", childId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingInvitation) {
    return { error: "Ya existe una invitación pendiente para este email." };
  }

  let invitation: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS; attempt += 1) {
    const code = generateInviteCode();
    const { data, error } = await supabase
      .from("invitations")
      .insert({
        child_id: childId,
        invited_by: user.userId,
        full_name: fullName,
        email,
        relationship: relationship as Relationship,
        code,
      })
      .select("id, code")
      .single();

    if (!error && data) {
      invitation = data;
      break;
    }

    if (error?.code !== "23505") {
      return { error: "No se pudo crear la invitación. Inténtalo de nuevo." };
    }
  }

  if (!invitation) {
    return { error: "No se pudo crear la invitación. Inténtalo de nuevo." };
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  const activateUrl = `${proto}://${host}/activate?code=${invitation.code}`;

  const sendResult = await sendInvitationEmail({
    to: email,
    parentName: fullName,
    childName: child.full_name,
    code: invitation.code,
    activateUrl,
  });

  if (sendResult.error) {
    await supabase.from("invitations").delete().eq("id", invitation.id);
    return { error: sendResult.error };
  }

  revalidatePath(`/kids/${childId}`);
  return { ok: true };
}
