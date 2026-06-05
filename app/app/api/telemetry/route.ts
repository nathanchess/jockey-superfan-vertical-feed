import { NextRequest, NextResponse } from "next/server";
import { logServerTelemetry } from "@/lib/telemetry";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const eventName = typeof body.event === "string" ? body.event : "unknown_event";
    logServerTelemetry({
      event: eventName,
      ...body,
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
