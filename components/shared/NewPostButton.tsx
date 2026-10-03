"use client";

import { useFeed } from "@/app/(staff)/_components/feed/FeedContext";
import { PlusIcon } from "./icons";

export function NewPostButton() {
  const { openModal } = useFeed();
  return (
    <button
      type="button"
      onClick={openModal}
      className="mb-[18px] flex w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,var(--brand-deep-soft),var(--brand-deep))] py-3 text-[14.5px] font-extrabold text-white shadow-cta"
    >
      <PlusIcon className="h-[17px] w-[17px]" />
      Nueva publicación
    </button>
  );
}