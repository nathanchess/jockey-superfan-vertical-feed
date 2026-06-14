import { NextRequest, NextResponse } from "next/server";
import { loadManifest } from "@/lib/manifest";
import { isProfileId, rankFeedPage } from "@/lib/ranking";
import { resolveShowId } from "@/lib/shows";
import { logServerTelemetry } from "@/lib/telemetry";
import type { FeedPageResponse } from "@/lib/types";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_OFFSET = 10_000;

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const { searchParams } = request.nextUrl;
  const profileParam = searchParams.get("profile") ?? "drama_addict";
  const showParam = resolveShowId(searchParams.get("show"));
  const offsetParam = searchParams.get("offset") ?? "0";
  const limitParam = searchParams.get("limit") ?? String(DEFAULT_LIMIT);

  if (!isProfileId(profileParam)) {
    return NextResponse.json(
      { error: "Invalid profile. Use drama_addict, fashion_obsessed, or romance_fan." },
      { status: 400 },
    );
  }

  const offset = Number(offsetParam);
  const limit = Number(limitParam);

  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    return NextResponse.json({ error: "Invalid offset." }, { status: 400 });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return NextResponse.json({ error: "Invalid limit." }, { status: 400 });
  }

  const manifest = loadManifest(showParam);
  const page = rankFeedPage(manifest.segments, profileParam, offset, limit);
  const durationMs = Date.now() - startedAt;
  logServerTelemetry({
    event: "feed_generation",
    show: showParam,
    profile: profileParam,
    offset,
    limit,
    clips_count: page.clips.length,
    has_more: page.hasMore,
    duration_ms: durationMs,
  });

  const body: FeedPageResponse = {
    show: showParam,
    profile: profileParam,
    offset: page.offset,
    limit: page.limit,
    clips: page.clips,
    hasMore: page.hasMore,
    show_name: manifest.show_name,
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Request-Duration-Ms": String(durationMs),
    },
  });
}
