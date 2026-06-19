import { PREFERENCE_PROFILES } from "@/lib/profiles";
import { scoreSegment } from "@/lib/scoring";
import { segmentSpanKey } from "@/lib/segmentLookup";
import type { ProfileId, RankedSegment, Segment } from "@/lib/types";

export type RelatedClipSource = Pick<
  Segment,
  "asset_id" | "start_sec" | "end_sec" | "subtags"
> & {
  primary_category?: string;
};

function subtagOverlap(a: Segment, b: RelatedClipSource): number {
  const aTags = new Set(a.subtags ?? []);
  let count = 0;
  for (const tag of b.subtags ?? []) {
    if (aTags.has(tag)) count += 1;
  }
  return count;
}

export function findRelatedClips(
  segments: Segment[],
  source: RelatedClipSource,
  profile: ProfileId,
  limit = 6,
): RankedSegment[] {
  const preference = PREFERENCE_PROFILES[profile];
  const sourceKey = segmentSpanKey(source);

  const ranked = segments
    .map((segment) => scoreSegment(segment, preference))
    .filter((segment): segment is NonNullable<typeof segment> => segment !== null)
    .filter((segment) => segmentSpanKey(segment) !== sourceKey)
    .map((segment) => {
      let boost = 0;
      if (source.primary_category && segment.primary_category === source.primary_category) {
        boost += 12;
      }
      boost += subtagOverlap(segment, source) * 4;
      return { segment, sortScore: boost + segment.match_score };
    })
    .sort((a, b) => b.sortScore - a.sortScore)
    .slice(0, limit)
    .map(({ segment }, index) => ({
      ...segment,
      scroll_index: index,
    }));

  return ranked;
}
