import Link from "next/link";
import {
  HomeIcon,
  LogoutIcon,
  SunIcon,
  UserIcon,
} from "./icons";
import { signOut } from "@/app/_actions/auth";
import type { CurrentUser } from "@/utils/supabase/types";

type NavItem = {
  id: string;
  label: string;
  icon: typeof HomeIcon;
  href?: string;
  section?: "feed";
  enabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: "feed", label: "Feed", icon: HomeIcon, href: "/familiar", section: "feed", enabled: true },
  { id: "summary", label: "Resumen del día", icon: SunIcon, enabled: false },
  { id: "account", label: "Mi cuenta", icon: UserIcon, enabled: false },
];

function getInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function NavItemView({ item, active }: { item: NavItem; active: boolean }) {
  const { label, icon: Icon, href, enabled = true } = item;
  const className = active
    ? "flex items-center gap-3 rounded-xl bg-accent-soft px-3 py-[11px] text-[14.5px] font-extrabold text-accent"
    : "flex items-center gap-3 rounded-xl px-3 py-[11px] text-[14.5px] font-semibold text-idle";
  if (href && enabled) {
    return (
      <Link href={href} className={className}>
        <Icon className="h-[19px] w-[19px]" />
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      aria-label={`${label} (próximamente)`}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <Icon className="h-[19px] w-[19px]" />
      {label}
    </button>
  );
}

export function FamilySidebar({
  active = "feed",
  currentUser,
}: {
  active?: "feed";
  currentUser: CurrentUser;
}) {
  const initials = getInitials(currentUser.fullName);

  return (
    <aside
      aria-label="Barra lateral de familia de OpenDayCare"
      className="sticky top-0 flex h-full w-[248px] shrink-0 flex-col border-r border-border bg-surface px-4 py-6"
    >
      <div className="flex items-center gap-[11px] px-2 pb-[22px] pt-1">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(155deg,var(--brand-soft),var(--brand))]">
          <SunIcon className="h-[21px] w-[21px] text-white" />
        </div>
        <div>
          <div className="font-display text-[17px] font-semibold leading-none text-ink">
            OpenDayCare
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">Familia</div>
        </div>
      </div>

      <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavItemView
            key={item.id}
            item={item}
            active={item.section === active}
          />
        ))}
      </nav>

      <div className="mt-2.5 border-t border-border pt-3.5">
        <div className="flex items-center gap-[11px] p-1.5 px-2">
          <div
            aria-hidden="true"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full font-display text-base font-semibold text-white"
            style={{ backgroundColor: "#C9B6E8" }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold text-ink">
              {currentUser.fullName}
            </div>
            <div className="text-xs text-muted">Familia · Sala Soles</div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
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