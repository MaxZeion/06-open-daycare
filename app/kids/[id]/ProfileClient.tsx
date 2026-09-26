"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon, PlusIcon, SunIcon } from "../../../components/shared/icons";
import { AllergyBox } from "../../../components/kids/AllergyBox";
import { InfoRow } from "../../../components/kids/InfoRow";
import { LinkParentModal } from "../../../components/kids/LinkParentModal";
import { ParentRow } from "../../../components/kids/ParentRow";
import type { Kid, Parent } from "../../../components/kids/mockKids";

function InfoCard({ kid }: { kid: Kid }) {
  const rows = [
    kid.birthDate ? { label: "Fecha de nacimiento", value: kid.birthDate } : null,
    { label: "Sala", value: kid.sala },
    kid.entry ? { label: "Ingreso", value: kid.entry } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);

  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
      {rows.map((row) => (
        <InfoRow key={row.label} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

function ParentsColumn({
  parents,
  onVincularClick,
}: {
  parents: Parent[];
  onVincularClick: () => void;
}) {
  return (
    <div className="flex w-[300px] flex-none flex-col gap-[14px]">
      <button
        type="button"
        className="flex w-full items-center justify-center gap-[9px] rounded-[14px] bg-dark-cta py-[13px] text-[15px] font-extrabold text-white"
      >
        <SunIcon className="h-[18px] w-[18px]" />
        Resumen del día
      </button>

      <div className="rounded-[16px] border border-border bg-surface px-[18px] py-4">
        <div className="mb-[14px] text-[12.5px] font-extrabold tracking-[0.8px] text-divider-ink">
          PADRES VINCULADOS
        </div>
        <div className="flex flex-col gap-[14px]">
          {parents.map((parent) => (
            <ParentRow key={parent.name} parent={parent} />
          ))}
          <button
            type="button"
            onClick={onVincularClick}
            className="flex items-center gap-3 pt-2"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-photo-placeholder-border">
              <PlusIcon className="h-[18px] w-[18px] text-photo-placeholder-fg" />
            </span>
            <span className="text-[14.5px] font-extrabold text-accent-deep">
              Vincular otro padre
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfileClient({ kid }: { kid: Kid }) {
  const [parents, setParents] = useState<Parent[]>(kid.parents ?? []);
  const [linkOpen, setLinkOpen] = useState(false);

  function handleSubmit(parent: Parent) {
    setParents((prev) => [...prev, parent]);
    setLinkOpen(false);
  }

  return (
    <>
      <Link
        href="/kids"
        className="mb-5 flex items-center gap-2 text-[14px] font-bold text-muted-strong"
      >
        <ArrowLeftIcon className="h-[18px] w-[18px]" />
        Volver a Niños
      </Link>

      <div className="flex flex-wrap items-start gap-[26px]">
        <div className="flex min-w-[300px] flex-1 flex-col gap-[18px]">
          <div className="flex items-center gap-[18px]">
            <div
              className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-full font-display text-[34px] font-semibold"
              style={{ backgroundColor: kid.avatar.bg, color: kid.avatar.fg }}
            >
              {kid.initials}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[28px] font-semibold text-ink">
                {kid.name}
              </h1>
              <p className="mt-[3px] text-[15px] text-muted-strong">
                {kid.age} años · Sala {kid.sala}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-[12px] border-[1.5px] border-border bg-surface px-4 py-[9px] text-[14px] font-bold text-idle"
            >
              Editar
            </button>
          </div>

          {kid.allergyNotes ? <AllergyBox notes={kid.allergyNotes} /> : null}

          <InfoCard kid={kid} />
        </div>

        <ParentsColumn
          parents={parents}
          onVincularClick={() => setLinkOpen(true)}
        />
      </div>

      <LinkParentModal
        open={linkOpen}
        kidName={kid.name}
        existingParentsCount={parents.length}
        onClose={() => setLinkOpen(false)}
        onSubmit={handleSubmit}
      />
    </>
  );
}
