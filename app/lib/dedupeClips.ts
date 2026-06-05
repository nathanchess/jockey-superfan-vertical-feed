import { clipGridKey } from "@/lib/clipKey";

type ClipLike = {
  asset_id: string;
  start_sec: number;
  end_sec: number;
  segment_id: string;
  scroll_index?: number;
};

/** Drop duplicate clips so React keys and grid slots stay unique. */
export function dedupeClips<T extends ClipLike>(clips: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const clip of clips) {
    const key = clipGridKey(clip);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clip);
  }
  return out;
}
