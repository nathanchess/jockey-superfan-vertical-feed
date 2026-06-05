import {
  isPrimaryCategory,
  normalizeSubtag,
  SUBTAG_ENUM,
} from "@/lib/taxonomy";
import type { IntensityPreference, PreferenceProfile, Segment } from "@/lib/types";

export const SCORE_BASE = 1.0;
export const SCORE_SUBTAG = 0.25;
export const SCORE_INTENSITY = 0.5;
export const SCORE_JOCKEY = 1.0;

export function intensityMatchesPreference(
  emotionalIntensity: number,
  intensityPreference: IntensityPreference,
): boolean {
  if (intensityPreference === "any") return true;
  if (intensityPreference === "high") return emotionalIntensity >= 8;
  if (intensityPreference === "medium") return emotionalIntensity >= 6 && emotionalIntensity <= 8;
  return false;
}

export type ScoredSegment = Segment & {
  match_score: number;
  score_breakdown: Record<string, number>;
};

/**
 * PRD scoring: base + subtag boosts + intensity + jockey.
 * Handles Pegasus putting category slugs in subtags[] via normalize + category-align.
 */
export function scoreSegment(
  segment: Segment,
  profile: PreferenceProfile,
): ScoredSegment | null {
  if (!profile.categories.includes(segment.primary_category)) return null;

  const breakdown: Record<string, number> = { base: SCORE_BASE };
  let score = SCORE_BASE;
  const credited = new Set<string>();

  const creditSubtag = (key: string) => {
    if (credited.has(key)) return;
    credited.add(key);
    score += SCORE_SUBTAG;
    breakdown[key] = SCORE_SUBTAG;
  };

  for (const rawTag of segment.subtags ?? []) {
    const tag = normalizeSubtag(rawTag);

    if (profile.subtag_boosts.includes(tag) && SUBTAG_ENUM.has(tag)) {
      creditSubtag(`subtag_${tag}`);
      continue;
    }

    // Pegasus often lists another profile category in subtags (e.g. shade_gossip on a fight clip).
    if (
      isPrimaryCategory(rawTag) &&
      profile.categories.includes(rawTag) &&
      rawTag !== segment.primary_category
    ) {
      creditSubtag(`category_${rawTag}`);
    }
  }

  if (intensityMatchesPreference(segment.emotional_intensity, profile.intensity_preference)) {
    score += SCORE_INTENSITY;
    breakdown.intensity = SCORE_INTENSITY;
  }

  if (segment.jockey_boost) {
    score += SCORE_JOCKEY;
    breakdown.jockey = SCORE_JOCKEY;
  }

  return { ...segment, match_score: score, score_breakdown: breakdown };
}
