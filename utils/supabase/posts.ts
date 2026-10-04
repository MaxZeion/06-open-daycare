import { cookies } from "next/headers";
import { createClient } from "./server";
import { getCurrentUser } from "./auth";
import type { CurrentUser } from "./types";
import type { PostKind } from "@/app/(staff)/_components/feed/mockPosts";
import { avatarFor } from "@/app/(staff)/_components/kids/mapKid";

export interface FeedPhoto {
  url: string;
  width?: number;
  height?: number;
}

export interface FeedPostAuthor {
  name: string;
  initials: string;
  bg: string;
  fg: string;
}

export interface FeedPost {
  id: string;
  author: FeedPostAuthor;
  time: string;
  publishedBy: string;
  kind: PostKind;
  recipient: string;
  body: string;
  photos: FeedPhoto[];
  likes: number;
  comments: number;
  childIds?: string[];
  publishedAt?: string;
}

export const MAP_KIND: Record<string, PostKind> = {
  meal: "comida",
  nap: "siesta",
  activity: "actividad",
  achievement: "logro",
  mood: "animo",
  photo: "foto",
  announcement: "anuncio",
};

export const MAP_KIND_UI_TO_DB: Record<PostKind, string> = {
  comida: "meal",
  siesta: "nap",
  actividad: "activity",
  logro: "achievement",
  animo: "mood",
  foto: "photo",
  anuncio: "announcement",
};

interface PostChildRow {
  child_id: string;
  children: {
    id: string;
    full_name: string;
    room: { name: string } | null;
  } | null;
}

interface PostPhotoRow {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  position: number;
}

interface PostRow {
  id: string;
  type: string;
  body: string;
  published_at: string;
  author_id: string;
  author: { full_name: string } | null;
  post_children: PostChildRow[] | null;
  post_photos: PostPhotoRow[] | null;
}

function buildAuthorFromChild(
  childId: string,
  fullName: string,
): FeedPostAuthor {
  const firstName = fullName.split(" ")[0] ?? fullName;
  const avatar = avatarFor(childId);
  return {
    name: firstName,
    initials: firstName.charAt(0).toUpperCase(),
    bg: avatar.bg,
    fg: avatar.fg,
  };
}

function buildAuthorForAnnouncement(): FeedPostAuthor {
  return {
    name: "Anuncio general",
    initials: "",
    bg: "var(--avatar-anuncio-bg)",
    fg: "var(--avatar-anuncio-fg)",
  };
}

function buildRecipient(children: PostChildRow[]): string {
  const firstNames = children
    .map((pc) => pc.children?.full_name.split(" ")[0] ?? "")
    .filter((name) => name.length > 0);
  if (firstNames.length === 0) return "toda la sala";
  if (firstNames.length === 1) return `familia de ${firstNames[0]}`;
  if (firstNames.length === 2)
    return `familia de ${firstNames[0]} y ${firstNames[1]}`;
  if (firstNames.length === 3)
    return `familia de ${firstNames[0]}, ${firstNames[1]} y ${firstNames[2]}`;
  const extra = firstNames.length - 3;
  return `familia de ${firstNames[0]}, ${firstNames[1]}, ${firstNames[2]} y ${extra} más`;
}

function formatPublishedBy(
  row: PostRow,
  viewerId: string,
): string {
  if (row.author_id === viewerId) return "publicado por ti";
  const authorName = row.author?.full_name ?? "Staff";
  const firstChildRoom = row.post_children?.[0]?.children?.room?.name;
  if (firstChildRoom) return `${authorName} · Sala ${firstChildRoom}`;
  return authorName;
}

function formatTimeEuropeMadrid(publishedAtIso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  }).format(new Date(publishedAtIso));
}

const POSTS_FEED_SELECT = `
  id, type, body, published_at, author_id,
  author:author_id ( full_name ),
  post_children (
    child_id,
    children:child_id ( id, full_name, room:room_id ( name ) )
  ),
  post_photos ( id, url, width, height, position )
`;

function toFeedPost(row: PostRow, viewerId: string): FeedPost {
  const children = row.post_children ?? [];
  const firstChild = children[0]?.children ?? null;

  const author: FeedPostAuthor = firstChild
    ? buildAuthorFromChild(firstChild.id, firstChild.full_name)
    : buildAuthorForAnnouncement();

  const photos: FeedPhoto[] = (row.post_photos ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      url: p.url,
      width: p.width ?? undefined,
      height: p.height ?? undefined,
    }));

  return {
    id: row.id,
    author,
    time: formatTimeEuropeMadrid(row.published_at),
    publishedBy: formatPublishedBy(row, viewerId),
    kind: MAP_KIND[row.type] ?? "actividad",
    recipient: buildRecipient(children),
    body: row.body,
    photos,
    likes: 0,
    comments: 0,
    childIds: children.map((pc) => pc.child_id),
    publishedAt: row.published_at,
  };
}

export async function listFeedPosts(): Promise<FeedPost[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const user = await getCurrentUser("/");

  const { data, error } = await supabase
    .from("posts")
    .select(POSTS_FEED_SELECT)
    .order("published_at", { ascending: false })
    .returns<PostRow[]>();

  if (error) {
    throw error;
  }
  if (!data) return [];

  return data.map((row) => toFeedPost(row, user.userId));
}

export async function listFeedPostsForParent(
  currentUser: CurrentUser,
): Promise<FeedPost[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: rows, error: rpcError } = await supabase.rpc(
    "get_feed_for_parent",
    {
      p_parent_id: currentUser.userId,
      p_daycare_id: currentUser.daycareId,
    },
  );

  if (rpcError) {
    throw rpcError;
  }
  const visibleIds = rows as Array<{ id: string }> | null;
  if (!visibleIds || visibleIds.length === 0) return [];

  const ids = visibleIds.map((row) => row.id);

  const { data, error } = await supabase
    .from("posts")
    .select(POSTS_FEED_SELECT)
    .in("id", ids)
    .order("published_at", { ascending: false })
    .returns<PostRow[]>();

  if (error) {
    throw error;
  }
  if (!data) return [];

  return data.map((row) => toFeedPost(row, currentUser.userId));
}