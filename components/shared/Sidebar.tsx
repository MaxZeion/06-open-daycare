import {
  BellIcon,
  HomeIcon,
  LogoutIcon,
  PlusIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
} from "./icons";

type NavItem = {
  label: string;
  icon: typeof HomeIcon;
  active?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Feed", icon: HomeIcon, active: true },
  { label: "Niños", icon: UsersIcon },
  { label: "Avisos", icon: BellIcon },
  { label: "Mi cuenta", icon: UserIcon },
];

function NavButton({ label, icon: Icon, active = false }: NavItem) {
  return (
    <button
      type="button"
      className={
        active
          ? "flex items-center gap-3 rounded-xl bg-accent-soft px-3 py-[11px] text-[14.5px] font-extrabold text-accent"
          : "flex items-center gap-3 rounded-xl px-3 py-[11px] text-[14.5px] font-semibold text-idle"
      }
    >
      <Icon className="h-[19px] w-[19px]" />
      {label}
    </button>
  );
}

export function Sidebar() {
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
        className="mb-[18px] flex w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,var(--brand-deep-soft),var(--brand-deep))] py-3 text-[14.5px] font-extrabold text-white shadow-cta"
      >
        <PlusIcon className="h-[17px] w-[17px]" />
        Nueva publicación
      </button>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.label} {...item} />
        ))}
      </nav>

      <div className="mt-2.5 border-t border-border pt-3.5">
        <div className="flex items-center gap-[11px] p-1.5 px-2">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand font-display text-base font-semibold text-white">
            C
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold text-ink">
              Caro Giménez
            </div>
            <div className="text-xs text-muted">Maestra · Soles</div>
          </div>
          <button
            type="button"
            title="Cerrar sesión"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bg text-muted-strong"
          >
            <LogoutIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
