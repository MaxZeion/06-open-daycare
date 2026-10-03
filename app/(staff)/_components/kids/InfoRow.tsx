export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border-soft px-[18px] py-[15px] last:border-b-0">
      <div className="text-[14.5px] text-muted-strong">{label}</div>
      <div className="text-[14.5px] font-extrabold text-ink">{value}</div>
    </div>
  );
}
