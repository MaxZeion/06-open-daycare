import type { Enums, Tables } from "@/types/supabase";
import { AVATAR_PALETTE, type AllergyTag, type Kid } from "./mockKids";

export type ChildrenRow = Tables<"children">;
export type Relationship = Enums<"relationship_type">;

export interface RoomOption {
  id: string;
  name: string;
}

const SPANISH_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const TAG_TO_ALLERGY: Record<string, AllergyTag> = {
  peanut: "maní",
  lactose: "lactosa",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SPANISH_TO_RELATIONSHIP: Record<string, Relationship> = {
  Mamá: "mother",
  "Papá": "father",
  "Tutor/a": "guardian",
};

const RELATIONSHIP_TO_SPANISH: Record<Relationship, string> = {
  mother: "Mamá",
  father: "Papá",
  guardian: "Tutor/a",
};

export function spanishToRelationship(label: string): Relationship | null {
  return SPANISH_TO_RELATIONSHIP[label] ?? null;
}

export function relationshipToSpanish(relationship: Relationship): string {
  return RELATIONSHIP_TO_SPANISH[relationship] ?? "";
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function validateFullName(raw: string): string | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts[1] ?? "";
  if (firstName.length < 3 || lastName.length === 0) {
    return "Introduce nombre y apellido (mínimo 3 caracteres en el nombre).";
  }
  return null;
}

function hashUuid(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function avatarFor(id: string): { bg: string; fg: string } {
  return AVATAR_PALETTE[hashUuid(id) % AVATAR_PALETTE.length];
}

function isoToDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function ageFromIso(birthDateIso: string): number {
  const birth = isoToDate(birthDateIso);
  if (!birth) {
    return 0;
  }
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return Math.max(age, 0);
}

export function formatSpanishDate(iso: string): string {
  const date = isoToDate(iso);
  if (!date) {
    return "";
  }
  return `${date.getDate()} ${SPANISH_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatSpanishMonthYear(iso: string): string {
  const date = isoToDate(iso);
  if (!date) {
    return "";
  }
  return `${SPANISH_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function textToTags(raw: string): string[] {
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const tags: string[] = [];
  if (normalized.includes("mani")) {
    tags.push("peanut");
  }
  if (normalized.includes("lactosa")) {
    tags.push("lactose");
  }
  return tags;
}

export function tagsToAllergy(tags: string[]): AllergyTag | undefined {
  for (const tag of tags) {
    const allergy = TAG_TO_ALLERGY[tag];
    if (allergy) {
      return allergy;
    }
  }
  return undefined;
}

function tagsToSpanishNotes(tags: string[]): string | undefined {
  const labels = tags
    .map((tag) => TAG_TO_ALLERGY[tag])
    .filter((label): label is AllergyTag => label !== undefined);

  if (labels.length === 0) {
    return undefined;
  }
  return `Alergia: ${labels.join(", ")}`;
}

export function mapChild(
  row: ChildrenRow,
  rooms: RoomOption[],
  parentsCount = 0,
): Kid {
  const room = rooms.find((item) => item.id === row.room_id);
  const trimmedName = row.full_name.trim();

  return {
    id: row.id,
    roomId: row.room_id ?? "",
    name: trimmedName,
    initials: trimmedName.charAt(0).toUpperCase(),
    avatar: AVATAR_PALETTE[hashUuid(row.id) % AVATAR_PALETTE.length],
    age: ageFromIso(row.birth_date),
    sala: room?.name ?? "",
    parentsCount,
    parents: [],
    birthDate: formatSpanishDate(row.birth_date),
    entry: formatSpanishMonthYear(row.enrolled_at),
    allergy: tagsToAllergy(row.allergy_tags),
    allergyNotes: tagsToSpanishNotes(row.allergy_tags),
    medicalNotes: row.medical_notes ?? undefined,
  };
}
