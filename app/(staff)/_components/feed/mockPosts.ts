export type PostKind =
  | "comida"
  | "siesta"
  | "actividad"
  | "logro"
  | "animo"
  | "foto"
  | "anuncio";

export const KIND_META: Record<PostKind, { label: string; bg: string; fg: string }> = {
  comida: { label: "COMIDA", bg: "var(--badge-comida-bg)", fg: "var(--badge-comida-fg)" },
  siesta: { label: "SIESTA", bg: "var(--badge-siesta-bg)", fg: "var(--badge-siesta-fg)" },
  actividad: {
    label: "ACTIVIDAD",
    bg: "var(--badge-actividad-bg)",
    fg: "var(--badge-actividad-fg)",
  },
  logro: { label: "LOGRO", bg: "var(--badge-logro-bg)", fg: "var(--badge-logro-fg)" },
  animo: { label: "ÁNIMO", bg: "var(--badge-animo-bg)", fg: "var(--badge-animo-fg)" },
  foto: { label: "FOTO", bg: "var(--badge-foto-bg)", fg: "var(--badge-foto-fg)" },
  anuncio: { label: "ANUNCIO", bg: "var(--badge-anuncio-bg)", fg: "var(--badge-anuncio-fg)" },
};

export interface Post {
  id: string;
  author: {
    name: string;
    initials: string;
    bg: string;
    fg: string;
  };
  time: string;
  publishedBy: string;
  kind: PostKind;
  recipient: string;
  body: string;
  photo?: string;
  likes: number;
  comments: number;
}

const MATEO = {
  name: "Mateo",
  initials: "M",
  bg: "var(--avatar-mateo-bg)",
  fg: "var(--avatar-mateo-fg)",
};

export const POSTS: Post[] = [
  {
    id: "post-logro-orinal",
    author: MATEO,
    time: "14:20",
    publishedBy: "publicado por ti",
    kind: "logro",
    recipient: "familia de Mateo",
    body: "¡Usó el orinal solito por primera vez! Estaba feliz de contárselo a todos. Un gran paso.",
    likes: 3,
    comments: 1,
  },
  {
    id: "post-actividad-temperas",
    author: MATEO,
    time: "09:40",
    publishedBy: "publicado por ti",
    kind: "actividad",
    recipient: "familia de Mateo",
    body: "Pintamos con témperas esta mañana. Mateo eligió el azul para todo y se concentró un montón mezclando colores.",
    photo: "Foto · pintando con témperas",
    likes: 5,
    comments: 2,
  },
  {
    id: "post-anuncio-parque",
    author: {
      name: "Anuncio general",
      initials: "",
      bg: "var(--avatar-anuncio-bg)",
      fg: "var(--avatar-anuncio-fg)",
    },
    time: "07:50",
    publishedBy: "publicado por ti",
    kind: "anuncio",
    recipient: "toda la sala",
    body: "El viernes salimos al parque por la mañana. Recuerden mandar gorra y una botellita de agua.",
    likes: 8,
    comments: 0,
  },
];
