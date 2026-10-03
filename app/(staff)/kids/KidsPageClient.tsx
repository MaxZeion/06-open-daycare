"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, SearchIcon } from "@/components/shared/icons";
import { KidCard } from "@/app/(staff)/_components/kids/KidCard";
import { AddKidModal } from "@/app/(staff)/_components/kids/AddKidModal";
import { RoomTabs } from "@/app/(staff)/_components/kids/RoomTabs";
import type { Kid } from "@/app/(staff)/_components/kids/mockKids";
import type { RoomOption } from "@/app/(staff)/_components/kids/mapKid";

type KidsPageClientProps = {
  rooms: RoomOption[];
  kids: Kid[];
  selectedRoomId: string;
};

export function KidsPageClient({ rooms, kids, selectedRoomId }: KidsPageClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const room of rooms) {
      map[room.id] = 0;
    }
    for (const kid of kids) {
      map[kid.roomId] = (map[kid.roomId] ?? 0) + 1;
    }
    return map;
  }, [rooms, kids]);

  const roomKids = kids.filter((kid) => kid.roomId === selectedRoomId);
  const term = query.trim().toLowerCase();
  const filtered = roomKids.filter((kid) => kid.name.toLowerCase().includes(term));

  function handleSelectRoom(roomId: string) {
    router.replace(roomId ? `/kids?room=${roomId}` : "/kids");
  }

  return (
    <>
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

        <RoomTabs
          rooms={rooms}
          counts={counts}
          selectedId={selectedRoomId}
          onSelect={handleSelectRoom}
        />

        <div className="mb-[22px] flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3">
          <SearchIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar niño…"
            className="flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
            {filtered.map((kid) => (
              <KidCard key={kid.id} kid={kid} />
            ))}
          </div>
        ) : (
          <p className="rounded-[14px] border border-border bg-surface px-4 py-6 text-center text-[14px] text-muted">
            {roomKids.length === 0
              ? "Aún no hay niños en esta sala."
              : "No se encontraron niños."}
          </p>
        )}
      </div>

      {addOpen ? (
        <AddKidModal
          rooms={rooms}
          defaultRoomId={selectedRoomId}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </>
  );
}
