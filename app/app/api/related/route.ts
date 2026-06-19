import { NextRequest, NextResponse } from "next/server";
import { loadManifest } from "@/lib/manifest";
import { isProfileId } from "@/lib/ranking";
import { findRelatedClips } from "@/lib/relatedClips";
import { resolveShowId } from "@/lib/shows";
import type { RankedSegment } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const profileParam = searchParams.get("profile") ?? "drama_addict";
  const showParam = resolveShowId(searchParams.get("show"));
  const assetId = searchParams.get("asset_id")?.trim();
  const startSec = Number(searchParams.get("start_sec"));
  const endSec = Number(searchParams.get("end_sec"));
  const primaryCategory = searchParams.get("primary_category") ?? undefined;
  const limit = Math.min(12, Math.max(1, Number(searchParams.get("limit") ?? "6")));

  if (!isProfileId(profileParam)) {
    return NextResponse.json(
      { error: "Invalid profile. Use drama_addict, fashion_obsessed, or romance_fan." },
      { status: 400 },
    );
  }

  if (!assetId || !Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    return NextResponse.json(
      { error: "Missing asset_id, start_sec, or end_sec." },
      { status: 400 },
    );
  }

  const manifest = loadManifest(showParam);
  const clips = findRelatedClips(
    manifest.segments,
    {
      asset_id: assetId,
      start_sec: startSec,
      end_sec: endSec,
      primary_category: primaryCategory,
    },
    profileParam,
    limit,
  );

  const body: { clips: RankedSegment[]; show_name?: string } = {
    clips,
    show_name: manifest.show_name,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
