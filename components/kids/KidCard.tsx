import Link from "next/link";
import { ChevronRightIcon } from "../shared/icons";
import type { Kid } from "./mockKids";

function parentsLabel(count: number): string {
  if (count === 0) return "sin padres vinculados";
  if (count === 1) return "1 padre vinculado";
  return `${count} padres vinculados`;
}

function CardRightSide({ kid }: { kid: Kid }) {
  if (kid.allergy) {
    return (
      <span className="flex-none rounded-full bg-allergy-badge-bg px-[9px] py-[5px] text-[11px] font-extrabold text-allergy-badge-fg">
        {kid.allergy.toUpperCase()}
      </span>
    );
  }
  if (kid.parentsCount === 0) {
    return (
      <span className="flex-none rounded-full bg-link-badge-bg px-[9px] py-[5px] text-[11px] font-extrabold text-link-badge-fg">
        VINCULAR
      </span>
    );
  }
  return (
    <ChevronRightIcon className="h-[18px] w-[18px] flex-none text-chevron-ink" />
  );
}

export function KidCard({ kid }: { kid: Kid }) {
  return (
    <Link
      href={`/kids/${kid.id}`}
      className="flex min-w-0 items-center gap-3.5 rounded-[18px] border border-border bg-surface p-4 shadow-card transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-kid-card-hover"
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-[19px] font-semibold"
        style={{ backgroundColor: kid.avatar.bg, color: kid.avatar.fg }}
      >
        {kid.initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[16px] font-semibold text-ink">
          {kid.name}
        </span>
        <span className="block text-[13px] text-muted">
          {kid.age} años · {parentsLabel(kid.parentsCount)}
        </span>
      </span>
      <CardRightSide kid={kid} />
    </Link>
  );
}
