import { NextRequest, NextResponse } from "next/server";
import { loadManifest } from "@/lib/manifest";
import { isProfileId } from "@/lib/ranking";
import { scoreSegment } from "@/lib/scoring";
import { PREFERENCE_PROFILES } from "@/lib/profiles";
import { searchIndex } from "@/lib/twelvelabs";
import { logServerTelemetry } from "@/lib/telemetry";
import type { SearchHit, SearchResponse, Segment } from "@/lib/types";


function findManifestSegment(
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

function headlineFromHit(
  query: string,
  transcription: string | null,
  segment: Segment | null,
): string {
  if (segment?.feed_headline) return segment.feed_headline;
  if (transcription?.trim()) {
    const trimmed = transcription.trim();
    return trimmed.length > 72 ? `${trimmed.slice(0, 69)}…` : trimmed;
  }
  return `Moment matching "${query}"`;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q")?.trim() ?? "";
  const profileParam = searchParams.get("profile") ?? "drama_addict";

  if (!query) {
    return NextResponse.json({ error: "Missing search query." }, { status: 400 });
  }

  if (!isProfileId(profileParam)) {
    return NextResponse.json(
      { error: "Invalid profile. Use drama_addict, fashion_obsessed, or romance_fan." },
      { status: 400 },
    );
  }

  try {
    const manifest = loadManifest();
    const preference = PREFERENCE_PROFILES[profileParam];
    const rawHits = await searchIndex(query, 30);

    const seen = new Set<string>();

    const results: SearchHit[] = [];
    for (const hit of rawHits) {
      const dedupeKey = `${hit.asset_id}:${hit.start_sec}:${hit.end_sec}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const segment = findManifestSegment(
        manifest.segments,
        hit.asset_id,
        hit.start_sec,
        hit.end_sec,
      );

      const scored = segment ? scoreSegment(segment, preference) : null;

      results.push({
        asset_id: hit.asset_id,
        start_sec: hit.start_sec,
        end_sec: hit.end_sec,
        thumbnail_url: hit.thumbnail_url ?? null,
        transcription: hit.transcription,
        search_rank: hit.search_rank,
        segment_id: `search_${hit.asset_id}_${Math.round(hit.start_sec * 10)}_${Math.round(hit.end_sec * 10)}`,
        feed_headline: headlineFromHit(query, hit.transcription, segment),
        description:
          segment?.description ??
          hit.transcription?.trim() ??
          "A matching moment from your show library.",
        match_score: scored?.match_score,
        primary_category: segment?.primary_category,
        emotional_intensity: segment?.emotional_intensity,
      });
    }

    results.sort((a, b) => {
      const rankDiff = b.search_rank - a.search_rank;
      if (Math.abs(rankDiff) > 0.001) return rankDiff;
      return (b.match_score ?? 0) - (a.match_score ?? 0);
    });

    const body: SearchResponse = {
      query,
      profile: profileParam,
      results: results.slice(0, 24),
      show_name: manifest.show_name,
    };
    const durationMs = Date.now() - startedAt;
    logServerTelemetry({
      event: "search_generation",
      profile: profileParam,
      query_length: query.length,
      results_count: body.results.length,
      duration_ms: durationMs,
    });

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-Duration-Ms": String(durationMs),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search request failed";
    const status =
      message.includes("not configured") ? 503 : message.includes("Search failed") ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
