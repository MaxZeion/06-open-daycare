export type AllergyTag = "maní" | "lactosa";
export type ParentStatus = "activa" | "pendiente";

export interface Parent {
  name: string;
  initials: string;
  bg: string;
  fg: string;
  role: string;
  status: ParentStatus;
  note?: string;
}

export interface Kid {
  id: string;
  roomId: string;
  name: string;
  initials: string;
  avatar: { bg: string; fg: string };
  age: number;
  sala: string;
  parentsCount: number;
  allergy?: AllergyTag;
  birthDate?: string;
  entry?: string;
  allergyNotes?: string;
  medicalNotes?: string;
  parents?: Parent[];
}

export const AVATAR_PALETTE: Kid["avatar"][] = [
  { bg: "var(--avatar-mateo-bg)", fg: "var(--avatar-mateo-fg)" },
  { bg: "var(--avatar-sofia-bg)", fg: "var(--avatar-sofia-fg)" },
  { bg: "var(--avatar-benjamin-bg)", fg: "var(--avatar-benjamin-fg)" },
  { bg: "var(--avatar-valentina-bg)", fg: "var(--avatar-valentina-fg)" },
  { bg: "var(--avatar-tomas-bg)", fg: "var(--avatar-tomas-fg)" },
];
