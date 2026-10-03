"use client";

import type { ReactNode } from "react";
import { PostCard } from "./PostCard";
import type { FeedPost } from "@/utils/supabase/posts";

export type FeedHeader =
  | { kind: "staff"; teacherName: string; kidsCount: number; date: string }
  | { kind: "family"; parentName: string };

export function FeedPageClient({
  posts = [],
  header,
  children,
}: {
  posts?: FeedPost[];
  header?: FeedHeader;
  children?: ReactNode;
}) {
  const effectiveHeader: FeedHeader =
    header ?? {
      kind: "staff",
      teacherName: "Caro",
      kidsCount: 12,
      date: "martes 17 jun",
    };

  return (
    <div className="mx-auto w-full max-w-[760px] px-5 pb-24 pt-8 md:px-10 md:pb-20 md:pt-[34px]">
      <header className="mb-6">
        {effectiveHeader.kind === "staff" ? (
          <>
            <p className="mb-1 text-[12.5px] font-extrabold tracking-[0.8px] text-accent">
              GUARDERÍA · SALA SOLES
            </p>
            <h1 className="font-display text-[26px] font-semibold text-ink md:text-[30px]">
              Buenas, {effectiveHeader.teacherName}
            </h1>
            <p className="mt-[5px] text-[14.5px] text-muted-strong">
              {effectiveHeader.kidsCount} niños · {effectiveHeader.date}
            </p>
          </>
        ) : (
          <>
            <p className="mb-1 text-[12.5px] font-extrabold tracking-[0.8px] text-accent">
              TU FAMILIA
            </p>
            <h1 className="font-display text-[26px] font-semibold text-ink md:text-[30px]">
              Hola, {effectiveHeader.parentName}
            </h1>
            <p className="mt-[5px] text-[14.5px] text-muted-strong">
              Así va el día de hoy
            </p>
          </>
        )}
      </header>

      {children}

      <div className="mb-3.5 flex items-center gap-3.5">
        <span className="text-[12.5px] font-extrabold tracking-[0.8px] text-divider-ink">
          PUBLICADO HOY
        </span>
        <span className="h-px flex-1 bg-divider" />
      </div>

      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}