import { PROFILE_LABELS } from "@/lib/profiles";
import type { ProfileId, RankedSegment } from "@/lib/types";

const DEFAULT_SERIES_LABEL = "this series";

export function resolveShowName(clip: RankedSegment, manifestShowName?: string | null): string {
  const name = clip.show_name?.trim() || manifestShowName?.trim();
  return name || DEFAULT_SERIES_LABEL;
}

/** Frontend copy when Jockey corpus context applies but legacy manifests lack new prose. */
export function jockeyCorpusIntro(clip: RankedSegment, showName: string): string {
  if (showName === DEFAULT_SERIES_LABEL) {
    return (
      "Jockey compared this moment against your full show library in the Knowledge Store — " +
      "not just this isolated clip — to spot beats that matter across the whole series."
    );
  }
  return (
    `Across the full run of ${showName}, Jockey compared this moment to every episode in your ` +
    "Knowledge Store — not just this clip — to surface beats that define the series for superfans."
  );
}

export function personaAudiencePhrase(profileId: ProfileId): string {
  return `${PROFILE_LABELS[profileId]} viewers`;
}
