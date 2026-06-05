import type { IntensityPreference, PreferenceProfile, ProfileId } from "./types";

export const PREFERENCE_PROFILES: Record<ProfileId, PreferenceProfile> = {
  drama_addict: {
    categories: ["fights_confrontation", "shade_gossip", "emotional_moments"],
    intensity_preference: "high",
    subtag_boosts: ["screaming", "walkout", "betrayal"],
  },
  fashion_obsessed: {
    categories: ["luxury_fashion", "parties_nightlife"],
    intensity_preference: "any",
    subtag_boosts: ["designer_clothes", "jewelry_moment", "brand_callout"],
  },
  romance_fan: {
    categories: ["romance_relationships", "emotional_moments"],
    intensity_preference: "medium",
    subtag_boosts: ["kiss", "heartfelt_confession", "reconciliation"],
  },
};

export const PROFILE_LABELS: Record<ProfileId, string> = {
  drama_addict: "Drama Addict",
  fashion_obsessed: "Fashion Obsessed",
  romance_fan: "Romance Fan",
};

export const PROFILE_ICONS: Record<ProfileId, string> = {
  drama_addict: "exclamation",
  fashion_obsessed: "entity",
  romance_fan: "speech",
};

export function isProfileId(value: string): value is ProfileId {
  return value in PREFERENCE_PROFILES;
}
