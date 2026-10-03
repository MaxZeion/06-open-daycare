"use client";

import { useState, type ReactNode } from "react";
import { useFeed } from "@/app/(staff)/_components/feed/FeedContext";
import { StaffSidebar } from "./StaffSidebar";
import type { SectionId } from "./StaffSidebar";
import type { CurrentUser } from "@/utils/supabase/types";
import { MenuIcon, PlusIcon, SunIcon } from "./icons";

export function StaffShellClient({
  children,
  currentUser,
  active = "feed",
}: {
  children: ReactNode;
  currentUser: CurrentUser;
  active?: SectionId;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { openModal } = useFeed();

  return (
    <div className="flex h-dvh">
      <div className="hidden h-full md:block">
        <StaffSidebar active={active} currentUser={currentUser} />
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-[rgba(63,54,46,0.35)]"
          />
          <div className="absolute inset-y-0 left-0 shadow-[0_10px_40px_rgba(120,90,60,0.35)]">
<StaffSidebar active={active} currentUser={currentUser} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-3 md:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[linear-gradient(155deg,var(--brand-soft),var(--brand))]">
            <SunIcon className="h-[18px] w-[18px] text-white" />
          </div>
          <span className="font-display text-base font-semibold text-ink">
            OpenDayCare
          </span>
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((open) => !open)}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-[10px] text-ink"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>

        <button
          type="button"
          onClick={openModal}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,var(--brand-deep-soft),var(--brand-deep))] px-5 py-3.5 text-[14.5px] font-extrabold text-white shadow-cta md:hidden"
        >
          <PlusIcon className="h-[17px] w-[17px]" />
          Nueva publicación
        </button>
      </div>
    </div>
  );
}
