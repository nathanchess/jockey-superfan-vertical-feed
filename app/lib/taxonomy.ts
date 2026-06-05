/** Pegasus / Jockey taxonomy — keep in sync with ranking.py */

export const PRIMARY_CATEGORIES = [
  "fights_confrontation",
  "luxury_fashion",
  "romance_relationships",
  "humor_awkward",
  "parties_nightlife",
  "emotional_moments",
  "shade_gossip",
] as const;

export type PrimaryCategory = (typeof PRIMARY_CATEGORIES)[number];

export const CATEGORY_SUBTAGS: Record<PrimaryCategory, readonly string[]> = {
  fights_confrontation: [
    "screaming",
    "crying",
    "walkout",
    "physical_altercation",
    "hair_pulling",
    "table_flip",
    "glass_throw",
  ],
  luxury_fashion: [
    "designer_clothes",
    "jewelry_moment",
    "fancy_cars",
    "mansion_tour",
    "shopping_spree",
    "brand_callout",
  ],
  romance_relationships: [
    "kiss",
    "date_night",
    "proposal",
    "breakup_moment",
    "flirting",
    "jealousy_scene",
    "reconciliation",
  ],
  humor_awkward: [
    "awkward_silence",
    "verbal_slip",
    "physical_comedy",
    "reaction_shot",
    "shade_throwing",
    "side_eye",
  ],
  parties_nightlife: [
    "club_scene",
    "dinner_party",
    "champagne_toast",
    "dance_moment",
    "group_outing",
    "vacation_scene",
  ],
  emotional_moments: [
    "heartfelt_confession",
    "apology",
    "vulnerability",
    "family_moment",
    "tears_of_joy",
    "support_scene",
  ],
  shade_gossip: [
    "talking_behind_back",
    "revealing_secret",
    "confrontation_buildup",
    "alliance_forming",
    "betrayal",
  ],
};

export const SUBTAG_ENUM = new Set(
  Object.values(CATEGORY_SUBTAGS).flatMap((tags) => [...tags]),
);

const PRIMARY_SET = new Set<string>(PRIMARY_CATEGORIES);

/** Pegasus sometimes emits category slugs or loose labels in subtags[]. */
export const SUBTAG_ALIASES: Record<string, string> = {
  group_fight: "physical_altercation",
  drama: "betrayal",
  friendship_drama: "betrayal",
  tears: "crying",
  confrontation: "confrontation_buildup",
  apology: "apology",
  shade_throwing: "shade_throwing",
};

export function isPrimaryCategory(value: string): value is PrimaryCategory {
  return PRIMARY_SET.has(value);
}

/** Map loose tags to canonical subtag slugs when possible. */
export function normalizeSubtag(tag: string): string {
  if (SUBTAG_ENUM.has(tag)) return tag;
  return SUBTAG_ALIASES[tag] ?? tag;
}
