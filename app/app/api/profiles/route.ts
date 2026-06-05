import { NextResponse } from "next/server";
import { PROFILE_ICONS, PROFILE_LABELS, PREFERENCE_PROFILES } from "@/lib/profiles";
import type { ProfileId, ProfilesResponse } from "@/lib/types";

export async function GET() {
  const profiles = (Object.keys(PREFERENCE_PROFILES) as ProfileId[]).map((id) => ({
    id,
    label: PROFILE_LABELS[id],
    icon: PROFILE_ICONS[id],
  }));

  const body: ProfilesResponse = { profiles };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
