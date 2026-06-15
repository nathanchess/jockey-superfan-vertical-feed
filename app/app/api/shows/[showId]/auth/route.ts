import { NextRequest, NextResponse } from "next/server";
import { getShowAccessPassword, isShowId, isPasswordProtected } from "@/lib/shows";

/**
 * POST /api/shows/[showId]/auth
 * Body: { password: string }
 * Returns 200 OK if the password matches RHOSLC_PASSWORD (or whichever show env),
 * 401 if wrong, 400 if show is not password-protected.
 *
 * Password is only ever read server-side — never exposed to the client.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> },
) {
  const { showId } = await params;

  if (!isShowId(showId)) {
    return NextResponse.json({ error: "Unknown show." }, { status: 404 });
  }

  if (!isPasswordProtected(showId)) {
    return NextResponse.json({ error: "Show is not password-protected." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as { password?: string };
  const supplied = (body.password ?? "").trim();

  const expected = getShowAccessPassword(showId);

  if (!expected) {
    console.warn(`[auth] Password not configured for show "${showId}" (set RHOSLC_PASSWORD in env)`);
    return NextResponse.json({ error: "Access restricted." }, { status: 403 });
  }

  if (supplied !== expected) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
