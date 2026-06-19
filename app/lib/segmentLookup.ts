import { loadManifest } from "@/lib/manifest";
import { PREFERENCE_PROFILES } from "@/lib/profiles";
import { scoreSegment } from "@/lib/scoring";
import { resolveShowId, type ShowId } from "@/lib/shows";
import type { ProfileId, RankedSegment, Segment } from "@/lib/types";

export function segmentSpanKey(
  segment: Pick<Segment, "asset_id" | "start_sec" | "end_sec">,
): string {
  return `${segment.asset_id}:${segment.start_sec}:${segment.end_sec}`;
}

function findSegmentBySpan(
  segments: Segment[],
  assetId: string,
  startSec: number,
  endSec: number,
): Segment | null {
  let best: Segment | null = null;
  let bestOverlap = 0;

  for (const segment of segments) {
    if (segment.asset_id !== assetId) continue;
    const overlapStart = Math.max(segment.start_sec, startSec);
    const overlapEnd = Math.min(segment.end_sec, endSec);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = segment;
    }
  }

  return best;
}

export function resolveRankedSegment(
  showParam: string | null | undefined,
  profile: ProfileId,
  opts: {
    segment_id?: string | null;
    asset_id?: string | null;
    start_sec?: number | null;
    end_sec?: number | null;
  },
): RankedSegment | null {
  const showId = resolveShowId(showParam);
  const manifest = loadManifest(showId);
  let segment: Segment | null = null;

  if (opts.segment_id) {
    segment = manifest.segments.find((s) => s.segment_id === opts.segment_id) ?? null;
  }

  if (
    !segment &&
    opts.asset_id &&
    opts.start_sec != null &&
    opts.end_sec != null &&
    Number.isFinite(opts.start_sec) &&
    Number.isFinite(opts.end_sec)
  ) {
    segment = findSegmentBySpan(
      manifest.segments,
      opts.asset_id,
      opts.start_sec,
      opts.end_sec,
    );
  }

  if (!segment) return null;

  const scored = scoreSegment(segment, PREFERENCE_PROFILES[profile]);
  if (!scored) return null;

  return { ...scored, scroll_index: 0 };
}
