import { formatCategoryLabel } from "@/lib/categoryLabels";
import { marengoQueryForCategory } from "@/lib/manifestSearch";
import { isPrimaryCategory } from "@/lib/taxonomy";
import type { ProfileId } from "@/lib/types";

export const SUGGESTED_QUERIES: Record<ProfileId, readonly string[]> = {
  drama_addict: [
    "Heated argument at the dinner table",
    "Someone walks out crying",
    "Physical fight or table flip",
    "Shade thrown behind someone's back",
  ],
  fashion_obsessed: [
    "Designer outfit reveal",
    "Luxury shopping spree",
    "Jewelry and glam moment",
    "Mansion tour or fancy cars",
  ],
  romance_fan: [
    "Romantic date night",
    "Heartfelt confession or apology",
    "Kiss or proposal moment",
    "Breakup or reconciliation scene",
  ],
};

function capitalizeSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Semantic Marengo query for “search for more” from a browse category. */
export function categoryMomentsSearchQuery(category: string): string {
  const marengo = marengoQueryForCategory(category);
  if (marengo) return capitalizeSearchQuery(marengo);
  return capitalizeSearchQuery(formatCategoryLabel(category));
}

export function categoryFromSearchContext(category?: string | null): string | null {
  if (!category || !isPrimaryCategory(category)) return null;
  return category;
}

/** Build a semantic search query from clip metadata for “search for more”. */
export function similarSearchQuery(opts: {
  primary_category?: string;
  feed_headline?: string;
}): string {
  if (opts.primary_category) {
    return categoryMomentsSearchQuery(opts.primary_category);
  }
  if (opts.feed_headline?.trim()) {
    return capitalizeSearchQuery(opts.feed_headline.trim().slice(0, 80));
  }
  return "Similar dramatic moments";
}
