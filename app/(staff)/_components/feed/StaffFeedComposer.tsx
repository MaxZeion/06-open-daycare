"use client";

import { CameraIcon } from "@/components/shared/icons";
import { useFeed } from "./FeedContext";

export function StaffFeedComposer() {
  const { openModal } = useFeed();

  return (
    <button
      type="button"
      onClick={openModal}
      className="mb-6 flex w-full items-center gap-3.5 rounded-[18px] border border-border bg-surface px-[18px] py-3.5 shadow-composer"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand font-display text-base font-semibold text-white">
        C
      </span>
      <span className="min-w-0 flex-1 text-[15px] text-muted">
        Comparte un momento…
      </span>
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-hot">
        <CameraIcon className="h-[19px] w-[19px]" />
      </span>
    </button>
  );
}