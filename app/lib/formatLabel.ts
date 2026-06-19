/** Human-readable label from taxonomy slugs (fights_confrontation → fights confrontation). */
export function formatLabel(value: string): string {
  return value.replace(/_/g, " ");
}
