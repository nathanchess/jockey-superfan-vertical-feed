import { formatLabel } from "@/lib/formatLabel";

export function CategoryPills({
  category,
  subtags,
}: {
  category: string;
  subtags?: string[];
}) {
  const tags = [category, ...(subtags ?? []).slice(0, 2)];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className={`rounded-md border px-2 py-1 text-xs font-medium capitalize ${
            i === 0
              ? "border-border bg-card text-text-primary"
              : "border-border-light bg-surface text-text-secondary"
          }`}
        >
          {formatLabel(tag)}
        </span>
      ))}
    </div>
  );
}

export function IntensityBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="flex min-w-[140px] flex-1 items-center gap-2.5 sm:max-w-xs">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
        Intensity
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border-light">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-amber-400 to-orange-500 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-text-primary">
          {value}/{max}
        </span>
      </div>
    </div>
  );
}
