export type PostKind = "logro" | "actividad" | "anuncio";

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
