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