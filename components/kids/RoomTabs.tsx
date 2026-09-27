import type { RoomOption } from "./mapKid";

type RoomTabsProps = {
  rooms: RoomOption[];
  counts: Record<string, number>;
  selectedId: string;
  onSelect: (roomId: string) => void;
};

export function RoomTabs({ rooms, counts, selectedId, onSelect }: RoomTabsProps) {
  return (
    <div className="mb-[22px] flex flex-wrap gap-[10px]" role="tablist" aria-label="Salas">
      {rooms.map((room) => {
        const active = room.id === selectedId;
        const count = counts[room.id] ?? 0;
        return (
          <button
            key={room.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(room.id)}
            className={`flex items-center gap-2.5 rounded-[14px] border-[1.5px] px-4 py-[10px] text-[13px] font-extrabold uppercase tracking-[0.7px] transition-colors ${
              active
                ? "border-accent-soft bg-accent-soft text-accent"
                : "border-border bg-surface text-idle hover:border-accent-soft"
            }`}
          >
            {room.name}
            <span
              className={`flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-extrabold ${
                active ? "bg-accent text-white" : "bg-divider text-muted-strong"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
