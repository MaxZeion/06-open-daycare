"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Kid } from "../kids/mockKids";
import type { Post, PostKind } from "./mockPosts";
import { POSTS } from "./mockPosts";
import { NewPostModal } from "./NewPostModal";

interface PublishInput {
  kind: PostKind;
  body: string;
  kids: Kid[];
  allRoom: boolean;
}

interface FeedContextValue {
  posts: Post[];
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  publish: (input: PublishInput) => void;
}

const FeedContext = createContext<FeedContextValue | null>(null);

function firstName(kid: Kid): string {
  return kid.name.split(" ")[0];
}

export function buildRecipient(kids: Kid[], allRoom: boolean): string {
  if (allRoom) return "toda la sala";
  const names = kids.map(firstName);
  if (names.length <= 3) {
    if (names.length === 1) return `familia de ${names[0]}`;
    if (names.length === 2) return `familia de ${names[0]} y ${names[1]}`;
    return `familia de ${names[0]}, ${names[1]} y ${names[2]}`;
  }
  const extra = names.length - 3;
  return `familia de ${names[0]}, ${names[1]}, ${names[2]} y ${extra} más`;
}

function nowTime(): string {
  const date = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function FeedProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(POSTS);
  const [modalOpen, setModalOpen] = useState(false);

  const openModal = useCallback(() => setModalOpen(true), []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  const publish = useCallback((input: PublishInput) => {
    const author = input.allRoom
      ? {
          name: "Anuncio general",
          initials: "",
          bg: "var(--avatar-anuncio-bg)",
          fg: "var(--avatar-anuncio-fg)",
        }
      : {
          name: firstName(input.kids[0]),
          initials: input.kids[0].initials,
          bg: input.kids[0].avatar.bg,
          fg: input.kids[0].avatar.fg,
        };

    const post: Post = {
      id: `post-${Date.now()}`,
      author,
      time: nowTime(),
      publishedBy: "publicado por ti",
      kind: input.kind,
      recipient: buildRecipient(input.kids, input.allRoom),
      body: input.body.trim(),
      likes: 0,
      comments: 0,
    };
    setPosts((prev) => [post, ...prev]);
    setModalOpen(false);
  }, []);

  const value = useMemo(
    () => ({ posts, modalOpen, openModal, closeModal, publish }),
    [posts, modalOpen, openModal, closeModal, publish],
  );

  return (
    <FeedContext.Provider value={value}>
      {children}
      <NewPostModal open={modalOpen} onClose={closeModal} publish={publish} />
    </FeedContext.Provider>
  );
}

export function useFeed(): FeedContextValue {
  const context = useContext(FeedContext);
  if (!context) {
    throw new Error("useFeed debe usarse dentro de <FeedProvider>");
  }
  return context;
}
