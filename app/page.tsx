import { PostCard } from "../components/feed/PostCard";
import { POSTS } from "../components/feed/mockPosts";
import { AppShell } from "../components/shared/AppShell";
import { CameraIcon } from "../components/shared/icons";

export default function FeedPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[760px] px-5 pb-24 pt-8 md:px-10 md:pb-20 md:pt-[34px]">
        <header className="mb-6">
          <p className="mb-1 text-[12.5px] font-extrabold tracking-[0.8px] text-accent">
            GUARDERÍA · SALA SOLES
          </p>
          <h1 className="font-display text-[26px] font-semibold text-ink md:text-[30px]">
            Buenas, Caro
          </h1>
          <p className="mt-[5px] text-[14.5px] text-muted-strong">
            12 niños · martes 17 jun
          </p>
        </header>

        <button
          type="button"
          className="mb-6 flex w-full items-center gap-3.5 rounded-[18px] border border-border bg-surface px-[18px] py-3.5 shadow-composer"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand font-display text-base font-semibold text-white">
            C
          </span>
          <span className="min-w-0 flex-1 text-[15px] text-muted">
            Compartí un momento…
          </span>
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-hot">
            <CameraIcon className="h-[19px] w-[19px]" />
          </span>
        </button>

        <div className="mb-3.5 flex items-center gap-3.5">
          <span className="text-[12.5px] font-extrabold tracking-[0.8px] text-divider-ink">
            PUBLICADO HOY
          </span>
          <span className="h-px flex-1 bg-divider" />
        </div>

        <div className="flex flex-col gap-4">
          {POSTS.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
