import { NextResponse } from "next/server";
import { listShowCatalog } from "@/lib/manifest";
import { DEFAULT_SHOW_ID } from "@/lib/shows";
import type { ShowsResponse } from "@/lib/types";

export async function GET() {
  const shows = listShowCatalog();
  const body: ShowsResponse = {
    default_show: DEFAULT_SHOW_ID,
    shows,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
