export function MetaChip({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-border-light bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${valueClassName ?? "text-text-primary"}`}>
        {value}
      </p>
    </div>
  );
}
