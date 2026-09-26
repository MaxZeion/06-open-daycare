"use client";

import { useState } from "react";
import { AppShell } from "../../components/shared/AppShell";
import { PlusIcon, SearchIcon } from "../../components/shared/icons";
import { KidCard } from "../../components/kids/KidCard";
import { AddKidModal } from "../../components/kids/AddKidModal";
import { KIDS, type Kid } from "../../components/kids/mockKids";

export default function KidsPage() {
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addedKids, setAddedKids] = useState<Kid[]>([]);

  const allKids = [...addedKids, ...KIDS];
  const term = query.trim().toLowerCase();
  const filtered = allKids.filter((kid) => kid.name.toLowerCase().includes(term));

  function handleAddKid(kid: Kid) {
    setAddedKids((current) => [kid, ...current]);
    setAddOpen(false);
  }

  return (
    <AppShell active="kids">
      <div className="mx-auto w-full max-w-[880px] px-5 pt-8 pb-24 md:px-10 md:pt-[34px] md:pb-20">
        <header className="mb-[22px] flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[12.5px] font-extrabold tracking-[0.8px] text-accent">
              GESTIÓN
            </p>
            <h1 className="font-display text-[30px] font-semibold text-ink">
              Niños
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,var(--brand-deep-soft),var(--brand-deep))] px-[18px] py-[11px] text-[14.5px] font-extrabold text-white shadow-cta"
          >
            <PlusIcon className="h-[17px] w-[17px]" />
            Agregar niño
          </button>
        </header>

        <div className="mb-[22px] flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3">
          <SearchIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar niño…"
            className="flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        <div className="mb-3.5 flex items-center gap-3">
          <span className="text-[12.5px] font-extrabold tracking-[0.8px] text-ink">
            SALA SOLES
          </span>
          <span className="text-[13px] text-muted">{allKids.length} niños</span>
          <span className="h-px flex-1 bg-divider" />
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
            {filtered.map((kid) => (
              <KidCard key={kid.id} kid={kid} />
            ))}
          </div>
        ) : (
          <p className="rounded-[14px] border border-border bg-surface px-4 py-6 text-center text-[14px] text-muted">
            No se encontraron niños.
          </p>
        )}
      </div>

      <AddKidModal
        open={addOpen}
        addedCount={addedKids.length}
        onClose={() => setAddOpen(false)}
        onSave={handleAddKid}
      />
    </AppShell>
  );
}
