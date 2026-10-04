import { SunIcon } from "@/components/shared/icons";

export function FamilyFeedEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <SunIcon className="size-9 text-muted" />
      <p className="text-[14.5px] text-muted-strong">
        Aún no hay publicaciones de tus peques.
      </p>
    </div>
  );
}
