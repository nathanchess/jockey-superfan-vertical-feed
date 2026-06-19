import { NextRequest, NextResponse } from "next/server";
import { isProfileId } from "@/lib/ranking";
import { resolveRankedSegment } from "@/lib/segmentLookup";
import { resolveShowId } from "@/lib/shows";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const profileParam = searchParams.get("profile") ?? "drama_addict";
  const showParam = searchParams.get("show");
  const segmentId = searchParams.get("segment_id");
  const assetId = searchParams.get("asset_id");
  const startSec = searchParams.get("start_sec");
  const endSec = searchParams.get("end_sec");

  if (!isProfileId(profileParam)) {
    return NextResponse.json(
      { error: "Invalid profile. Use drama_addict, fashion_obsessed, or romance_fan." },
      { status: 400 },
    );
  }

  const clip = resolveRankedSegment(resolveShowId(showParam), profileParam, {
    segment_id: segmentId,
    asset_id: assetId,
    start_sec: startSec != null ? Number(startSec) : null,
    end_sec: endSec != null ? Number(endSec) : null,
  });

  if (!clip) {
    return NextResponse.json({ error: "Segment not found." }, { status: 404 });
  }

  return NextResponse.json({ clip }, { headers: { "Cache-Control": "private, no-store" } });
}
