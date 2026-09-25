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
  parents?: Parent[];
}

export const KIDS: Kid[] = [
  {
    id: "mateo-fernandez",
    name: "Mateo Fernández",
    initials: "M",
    avatar: { bg: "var(--avatar-mateo-bg)", fg: "var(--avatar-mateo-fg)" },
    age: 3,
    sala: "Soles",
    parentsCount: 2,
    allergy: "maní",
    birthDate: "12 mar 2022",
    entry: "feb 2025",
    allergyNotes:
      "Alergia al maní. Evitar frutos secos. Lleva inhalador en la mochila.",
    parents: [
      {
        name: "Lucía Fernández",
        initials: "L",
        bg: "var(--avatar-lucia-bg)",
        fg: "var(--avatar-lucia-fg)",
        role: "Mamá",
        status: "activa",
        note: "activa",
      },
      {
        name: "Diego Fernández",
        initials: "D",
        bg: "var(--avatar-diego-bg)",
        fg: "var(--avatar-diego-fg)",
        role: "Papá",
        status: "pendiente",
        note: "invitación enviada",
      },
    ],
  },
  {
    id: "sofia-mendez",
    name: "Sofía Méndez",
    initials: "S",
    avatar: { bg: "var(--avatar-sofia-bg)", fg: "var(--avatar-sofia-fg)" },
    age: 2,
    sala: "Soles",
    parentsCount: 1,
    parents: [
      {
        name: "Ana Méndez",
        initials: "A",
        bg: "var(--avatar-lucia-bg)",
        fg: "var(--avatar-lucia-fg)",
        role: "Mamá",
        status: "activa",
        note: "activa",
      },
    ],
  },
  {
    id: "benjamin-ruiz",
    name: "Benjamín Ruiz",
    initials: "B",
    avatar: { bg: "var(--avatar-benjamin-bg)", fg: "var(--avatar-benjamin-fg)" },
    age: 3,
    sala: "Soles",
    parentsCount: 2,
    parents: [
      {
        name: "Carmen Ruiz",
        initials: "C",
        bg: "var(--avatar-lucia-bg)",
        fg: "var(--avatar-lucia-fg)",
        role: "Mamá",
        status: "activa",
        note: "activa",
      },
      {
        name: "Pablo Ruiz",
        initials: "P",
        bg: "var(--avatar-diego-bg)",
        fg: "var(--avatar-diego-fg)",
        role: "Papá",
        status: "activa",
        note: "activa",
      },
    ],
  },
  {
    id: "valentina-soto",
    name: "Valentina Soto",
    initials: "V",
    avatar: { bg: "var(--avatar-valentina-bg)", fg: "var(--avatar-valentina-fg)" },
    age: 2,
    sala: "Soles",
    parentsCount: 0,
    parents: [],
  },
  {
    id: "tomas-diaz",
    name: "Tomás Díaz",
    initials: "T",
    avatar: { bg: "var(--avatar-tomas-bg)", fg: "var(--avatar-tomas-fg)" },
    age: 3,
    sala: "Soles",
    parentsCount: 1,
    allergy: "lactosa",
    allergyNotes: "Alergia a la lactosa. Dar fórmula libre de lactosa.",
    parents: [
      {
        name: "Laura Díaz",
        initials: "L",
        bg: "var(--avatar-lucia-bg)",
        fg: "var(--avatar-lucia-fg)",
        role: "Mamá",
        status: "activa",
        note: "activa",
      },
    ],
  },
  {
    id: "emma-castro",
    name: "Emma Castro",
    initials: "E",
    avatar: { bg: "var(--avatar-emma-bg)", fg: "var(--avatar-emma-fg)" },
    age: 2,
    sala: "Soles",
    parentsCount: 1,
    parents: [
      {
        name: "Elena Castro",
        initials: "E",
        bg: "var(--avatar-lucia-bg)",
        fg: "var(--avatar-lucia-fg)",
        role: "Mamá",
        status: "activa",
        note: "activa",
      },
    ],
  },
  {
    id: "lucas-romero",
    name: "Lucas Romero",
    initials: "L",
    avatar: { bg: "var(--avatar-lucas-bg)", fg: "var(--avatar-lucas-fg)" },
    age: 3,
    sala: "Soles",
    parentsCount: 1,
    parents: [
      {
        name: "Jorge Romero",
        initials: "J",
        bg: "var(--avatar-diego-bg)",
        fg: "var(--avatar-diego-fg)",
        role: "Papá",
        status: "activa",
        note: "activa",
      },
    ],
  },
  {
    id: "olivia-vega",
    name: "Olivia Vega",
    initials: "O",
    avatar: { bg: "var(--avatar-olivia-bg)", fg: "var(--avatar-olivia-fg)" },
    age: 2,
    sala: "Soles",
    parentsCount: 1,
    parents: [
      {
        name: "Marta Vega",
        initials: "M",
        bg: "var(--avatar-lucia-bg)",
        fg: "var(--avatar-lucia-fg)",
        role: "Mamá",
        status: "activa",
        note: "activa",
      },
    ],
  },
];
