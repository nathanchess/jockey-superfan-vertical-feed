import { StrandIcon } from "@/components/StrandIcon";
import { PROFILE_LABELS } from "@/lib/profiles";
import type { ProfileId } from "@/lib/types";

type PersonaEmptyStateProps = {
  profileId: ProfileId;
  compact?: boolean;
};

export function PersonaEmptyState({ profileId, compact = false }: PersonaEmptyStateProps) {
  const label = PROFILE_LABELS[profileId];

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "px-4 py-8" : "px-6 py-12"
      }`}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-card text-text-tertiary">
        <StrandIcon name="document" className="h-7 w-7 opacity-60" label="No clips" />
      </span>
      <h2 className={`mt-4 font-semibold text-text-primary ${compact ? "text-base" : "text-lg"}`}>
        No clips found
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
        No clips found matching{" "}
        <span className="font-medium text-text-primary">{label}</span>. Try switching personas.
      </p>
    </div>
  );
}
