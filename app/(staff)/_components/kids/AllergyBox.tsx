import { AlertTriangleIcon } from "@/components/shared/icons";

export function AllergyBox({
  title = "Alergias y notas",
  notes,
}: {
  title?: string;
  notes: string;
}) {
  return (
    <div className="flex gap-3.5 rounded-[16px] bg-alert-box-bg px-[18px] py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-alert-icon">
        <AlertTriangleIcon className="h-[22px] w-[22px] text-white" />
      </div>
      <div className="min-w-0">
        <div className="mb-0.5 text-[15px] font-extrabold text-alert-title">
          {title}
        </div>
        <div className="text-[14.5px] leading-normal text-alert-text">{notes}</div>
      </div>
    </div>
  );
}
