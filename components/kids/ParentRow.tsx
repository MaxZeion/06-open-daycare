import type { Parent } from "./mockKids";

const STATUS_STYLES: Record<Parent["status"], string> = {
  activa: "bg-parent-active-bg text-parent-active-fg",
  pendiente: "bg-parent-pending-bg text-parent-pending-fg",
};

export function ParentRow({ parent }: { parent: Parent }) {
  const subtitle = parent.note ? `${parent.role} · ${parent.note}` : parent.role;
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-base font-semibold"
        style={{ backgroundColor: parent.bg, color: parent.fg }}
      >
        {parent.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-extrabold text-ink">
          {parent.name}
        </div>
        <div className="text-[12.5px] text-muted">{subtitle}</div>
      </div>
      <div
        className={`flex-none rounded-full px-[9px] py-1 text-[10.5px] font-extrabold ${STATUS_STYLES[parent.status]}`}
      >
        {parent.status.toUpperCase()}
      </div>
    </div>
  );
}
