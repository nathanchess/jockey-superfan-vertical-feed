import { PRIMARY_CATEGORIES, type PrimaryCategory } from "@/lib/taxonomy";
import { formatLabel } from "@/lib/formatLabel";

export const CATEGORY_LABELS: Record<PrimaryCategory, string> = {
  fights_confrontation: "Fights & confrontation",
  luxury_fashion: "Luxury & fashion",
  romance_relationships: "Romance & relationships",
  humor_awkward: "Humor & awkward",
  parties_nightlife: "Parties & nightlife",
  emotional_moments: "Emotional moments",
  shade_gossip: "Shade & gossip",
};

export function formatCategoryLabel(value: string | undefined): string {
  if (!value) return "—";
  if (value in CATEGORY_LABELS) {
    return CATEGORY_LABELS[value as PrimaryCategory];
  }
  return formatLabel(value);
}

export const BROWSE_CATEGORIES = PRIMARY_CATEGORIES;
