import { NextRequest, NextResponse } from "next/server";
import { fetchAssetPlayback } from "@/lib/twelvelabs";
import type { AssetPlaybackResponse } from "@/lib/types";

type RouteContext = { params: Promise<{ assetId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { assetId } = await context.params;
  const id = assetId?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing asset id." }, { status: 400 });
  }

  try {
    const playback = await fetchAssetPlayback(id);
    const body: AssetPlaybackResponse = {
      asset_id: playback.asset_id,
      status: playback.status,
      hls_url: playback.hls_url ?? "",
      thumbnail_url: playback.thumbnail_url,
      duration: playback.duration,
      filename: playback.filename,
    };

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Asset lookup failed";
    const status = message.includes("not configured")
      ? 503
      : message.includes("Invalid asset")
        ? 400
        : message.includes("Could not resolve")
          ? 404
          : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
