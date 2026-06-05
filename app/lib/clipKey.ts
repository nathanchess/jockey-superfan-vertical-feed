/** Stable unique key for grid/list items. */
export function clipGridKey(clip: {
  asset_id: string;
  start_sec: number;
  end_sec: number;
  segment_id: string;
  scroll_index?: number;
}): string {
  const span = `${clip.asset_id}-${clip.start_sec}-${clip.end_sec}`;
  if (clip.scroll_index !== undefined) {
    return `${span}-${clip.scroll_index}`;
  }
  return `${clip.segment_id}-${span}`;
}
