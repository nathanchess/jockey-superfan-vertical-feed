import type { ProfileId, RankedSegment, Segment } from "./types";
import { PREFERENCE_PROFILES, PROFILE_ICONS, PROFILE_LABELS } from "./profiles";
import { scoreSegment } from "./scoring";

export { PREFERENCE_PROFILES, PROFILE_ICONS, PROFILE_LABELS };
export { isProfileId } from "./profiles";
export { intensityMatchesPreference } from "./scoring";

function buildBuckets(segments: Segment[], profile: ProfileId) {
  const preference = PREFERENCE_PROFILES[profile];
  const buckets: Record<string, ReturnType<typeof scoreSegment>[]> = {};

  for (const segment of segments) {
    const scored = scoreSegment(segment, preference);
    if (!scored) continue;
    (buckets[scored.primary_category] ??= []).push(scored);
  }

  for (const category of Object.keys(buckets)) {
    buckets[category].sort((a, b) => b!.match_score - a!.match_score);
  }

  const categoryOrder = Object.keys(buckets).sort(
    (a, b) => buckets[b]![0]!.match_score - buckets[a]![0]!.match_score,
  );

  const maxDepth = Math.max(0, ...Object.values(buckets).map((rows) => rows.length));

  return { buckets, categoryOrder, maxDepth };
}

/** Deterministic diversified scroll order; loops when depth is exhausted. */
export function nextFeedClips(
  segments: Segment[],
  profile: ProfileId,
  offset: number,
  limit: number,
): RankedSegment[] {
  const { buckets, categoryOrder, maxDepth } = buildBuckets(segments, profile);

  if (categoryOrder.length === 0 || maxDepth === 0) return [];

  // Total unique slots across all buckets for this profile — used as loop ceiling
  // so we never spin indefinitely when fewer clips exist than the requested limit.
  const totalSlots = Object.values(buckets).reduce((s, c) => s + c.length, 0);

  const clips: RankedSegment[] = [];
  const seenInPage = new Set<string>();
  let depth = 0;
  let catIndex = 0;
  let scrollIndex = 0;
  const nCats = categoryOrder.length;

  const segmentKey = (seg: Segment) =>
    `${seg.asset_id}:${seg.start_sec}:${seg.end_sec}`;

  while (clips.length < limit) {
    // Once we've stepped through every available slot (accounting for offset),
    // further iterations can only revisit already-seen clips — stop here.
    if (scrollIndex >= offset + totalSlots) break;

    let stepFound = false;
    for (let attempt = 0; attempt < nCats * Math.max(maxDepth, 1); attempt++) {
      const category = categoryOrder[catIndex];
      if (depth < buckets[category].length) {
        const candidate = buckets[category][depth]!;
        if (scrollIndex >= offset) {
          const key = segmentKey(candidate);
          if (!seenInPage.has(key)) {
            seenInPage.add(key);
            clips.push({
              ...candidate,
              scroll_index: scrollIndex,
            });
          }
        }
        scrollIndex += 1;
        catIndex = (catIndex + 1) % nCats;
        if (catIndex === 0) {
          depth += 1;
          if (depth >= maxDepth) depth = 0;
        }
        stepFound = true;
        break;
      }
      catIndex = (catIndex + 1) % nCats;
      if (catIndex === 0) {
        depth += 1;
        if (depth >= maxDepth) depth = 0;
      }
    }
    if (!stepFound) break;
  }

  return clips;
}

export function rankFeedPage(
  segments: Segment[],
  profile: ProfileId,
  offset: number,
  limit: number,
) {
  const clips = nextFeedClips(segments, profile, offset, limit);
  return {
    profile,
    offset,
    limit,
    clips,
    hasMore: clips.length === limit,
  };
}
