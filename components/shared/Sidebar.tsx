"use client";

import Link from "next/link";
import { useFeed } from "../feed/FeedContext";
import {
  BellIcon,
  HomeIcon,
  LogoutIcon,
  PlusIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
} from "./icons";
import { signOut } from "@/app/_actions/auth";
import type { CurrentUser, CurrentUserRole } from "@/utils/supabase/types";

export type SectionId = "feed" | "kids";

type NavItem = {
  label: string;
  icon: typeof HomeIcon;
  href?: string;
  section?: SectionId;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Feed", icon: HomeIcon, href: "/", section: "feed" },
  { label: "Niños", icon: UsersIcon, href: "/kids", section: "kids" },
  { label: "Avisos", icon: BellIcon },
  { label: "Mi cuenta", icon: UserIcon },
];

const ROLE_LABEL: Record<CurrentUserRole, string> = {
  staff: "Personal",
  parent: "Familia",
  admin: "Admin",
};

function getInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function NavItemView({ item, active }: { item: NavItem; active: boolean }) {
  const { label, icon: Icon, href } = item;
  const className =
    active
      ? "flex items-center gap-3 rounded-xl bg-accent-soft px-3 py-[11px] text-[14.5px] font-extrabold text-accent"
      : "flex items-center gap-3 rounded-xl px-3 py-[11px] text-[14.5px] font-semibold text-idle";
  return href ? (
    <Link href={href} className={className}>
      <Icon className="h-[19px] w-[19px]" />
      {label}
    </Link>
  ) : (
    <button type="button" className={className}>
      <Icon className="h-[19px] w-[19px]" />
      {label}
    </button>
  );
}

export function Sidebar({
  active = "feed",
  currentUser,
}: {
  active?: SectionId;
  currentUser: CurrentUser;
}) {
  const { openModal } = useFeed();
  const initials = getInitials(currentUser.fullName);

  return (
    <aside className="sticky top-0 flex h-full w-[248px] shrink-0 flex-col border-r border-border bg-surface px-4 py-6">
      <div className="flex items-center gap-[11px] px-2 pb-[22px] pt-1">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(155deg,var(--brand-soft),var(--brand))]">
          <SunIcon className="h-[21px] w-[21px] text-white" />
        </div>
        <div>
          <div className="font-display text-[17px] font-semibold leading-none text-ink">
            OpenDayCare
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">Sala Soles</div>
        </div>
      </div>

      <button
        type="button"
        onClick={openModal}
        className="mb-[18px] flex w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,var(--brand-deep-soft),var(--brand-deep))] py-3 text-[14.5px] font-extrabold text-white shadow-cta"
      >
        <PlusIcon className="h-[17px] w-[17px]" />
        Nueva publicación
      </button>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavItemView
            key={item.label}
            item={item}
            active={item.section === active}
          />
        ))}
      </nav>

      <div className="mt-2.5 border-t border-border pt-3.5">
        <div className="flex items-center gap-[11px] p-1.5 px-2">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand font-display text-base font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold text-ink">
              {currentUser.fullName}
            </div>
            <div className="text-xs text-muted">
              {ROLE_LABEL[currentUser.role]} · Sala Soles
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bg text-muted-strong transition-colors hover:text-accent"
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
