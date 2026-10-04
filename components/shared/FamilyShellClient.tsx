"use client";

import { useState, type ReactNode } from "react";
import { FamilySidebar } from "./FamilySidebar";
import type { CurrentUser } from "@/utils/supabase/types";
import { MenuIcon, SunIcon } from "./icons";

export function FamilyShellClient({
  children,
  currentUser,
  active = "feed",
}: {
  children: ReactNode;
  currentUser: CurrentUser;
  active?: "feed" | "summary";
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-dvh">
      <div className="hidden h-full md:block">
        <FamilySidebar active={active} currentUser={currentUser} />
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
            <FamilySidebar active={active} currentUser={currentUser} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-3 md:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[linear-gradient(155deg,#F8C3A8,#F2937A)]">
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
      </div>
    </div>
  );
}