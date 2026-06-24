import { scoreSegment } from "@/lib/scoring";
import { isPrimaryCategory, type PrimaryCategory } from "@/lib/taxonomy";
import type { PreferenceProfile, SearchHit, Segment } from "@/lib/types";

/** Map browse categories to Marengo-friendly transcription queries. */
export const CATEGORY_MARENGO_QUERIES: Record<PrimaryCategory, string> = {
  fights_confrontation: "argument yelling screaming fight",
  luxury_fashion: "designer clothes jewelry luxury",
  romance_relationships: "romantic date kiss relationship",
  humor_awkward: "awkward funny embarrassing moment",
  parties_nightlife: "party dinner celebration toast",
  emotional_moments: "crying emotional tears vulnerability",
  shade_gossip: "gossip talking behind back shade",
};

export function marengoQueryForCategory(category: string): string | null {
  if (!isPrimaryCategory(category)) return null;
  return CATEGORY_MARENGO_QUERIES[category];
}

export function manifestHitsForCategory(
  segments: Segment[],
  category: string,
  preference: PreferenceProfile,
  limit = 24,
): SearchHit[] {
  if (!isPrimaryCategory(category)) return [];

  const ranked = segments
    .filter((segment) => segment.primary_category === category)
    .map((segment) => scoreSegment(segment, preference))
    .filter((segment): segment is NonNullable<typeof segment> => segment !== null)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);

  return ranked.map((segment, index) => ({
    asset_id: segment.asset_id,
    start_sec: segment.start_sec,
    end_sec: segment.end_sec,
    thumbnail_url: null,
    transcription: null,
    search_rank: 1 - index * 0.01,
    segment_id: segment.segment_id,
    feed_headline: segment.feed_headline,
    description: segment.description,
    match_score: segment.match_score,
    primary_category: segment.primary_category,
    emotional_intensity: segment.emotional_intensity,
  }));
}
