import {
  HeartIcon,
  MegaphoneIcon,
  MessageIcon,
  PhotoIcon,
} from "../shared/icons";
import { KIND_META } from "./mockPosts";
import type { Post } from "./mockPosts";

export function PostCard({ post }: { post: Post }) {
  const kind = KIND_META[post.kind];
  return (
    <article className="rounded-[20px] border border-border bg-surface px-[22px] py-5 shadow-card">
      <header className="mb-3.5 flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-[17px] font-semibold"
          style={{ backgroundColor: post.author.bg, color: post.author.fg }}
        >
          {post.author.initials === "" ? (
            <MegaphoneIcon className="h-5 w-5" />
          ) : (
            post.author.initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[16.5px] font-semibold text-ink">
            {post.author.name}
          </h2>
          <p className="text-[12.5px] text-muted">
            {post.time} · {post.publishedBy}
          </p>
        </div>
        <div
          className="flex items-center gap-[7px] rounded-full px-3 py-1.5"
          style={{ backgroundColor: kind.bg, color: kind.fg }}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          <span className="text-xs font-extrabold tracking-[0.5px]">
            {kind.label}
          </span>
        </div>
      </header>

      <p className="mb-2.5 text-[12.5px] text-muted">
        Para: {post.recipient}
      </p>
      <p className="text-[15.5px] leading-[1.55] text-ink-soft">{post.body}</p>

      {post.photo ? (
        <div className="mt-3.5 flex h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-photo-placeholder-border bg-photo-placeholder-bg text-photo-placeholder-fg">
          <PhotoIcon className="h-[30px] w-[30px]" />
          <span className="text-[13.5px]">{post.photo}</span>
        </div>
      ) : null}

      <footer className="mt-4 flex items-center gap-[18px] border-t border-border-soft pt-3.5">
        <span className="flex items-center gap-[7px] text-sm font-bold text-accent-hot">
          <HeartIcon className="h-[19px] w-[19px]" />
          {post.likes}
        </span>
        <span className="flex items-center gap-[7px] text-sm font-bold text-muted-strong">
          <MessageIcon className="h-[18px] w-[18px]" />
          {post.comments}
        </span>
        <span className="flex-1" />
        <button type="button" className="text-sm font-extrabold text-accent-deep">
          Editar
        </button>
      </footer>
    </article>
  );
}
