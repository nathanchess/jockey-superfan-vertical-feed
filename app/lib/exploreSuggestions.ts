import type { ProfileId } from "@/lib/types";

export const SUGGESTED_QUERIES: Record<ProfileId, readonly string[]> = {
  drama_addict: [
    "heated argument at the dinner table",
    "someone walks out crying",
    "physical fight or table flip",
    "shade thrown behind someone's back",
  ],
  fashion_obsessed: [
    "designer outfit reveal",
    "luxury shopping spree",
    "jewelry and glam moment",
    "mansion tour or fancy cars",
  ],
  romance_fan: [
    "romantic date night",
    "heartfelt confession or apology",
    "kiss or proposal moment",
    "breakup or reconciliation scene",
  ],
};

/** Build a semantic search query from clip metadata for “explore similar”. */
export function similarSearchQuery(opts: {
  primary_category?: string;
  feed_headline?: string;
}): string {
  if (opts.primary_category) {
    return `more ${formatCategoryQuery(opts.primary_category)} moments`;
  }
  if (opts.feed_headline?.trim()) {
    return opts.feed_headline.trim().slice(0, 80);
  }
  return "similar dramatic moments";
}

function formatCategoryQuery(category: string): string {
  return category.replace(/_/g, " ");
}
