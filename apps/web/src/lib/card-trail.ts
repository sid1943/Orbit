/**
 * The cards opened one from another since leaving a page, oldest first, so a card opened from
 * another card can offer Back to it. Leaving for a page empties it; going back pops it.
 */
export function nextTrail(trail: readonly string[], cardId: string | null): string[] {
  if (!cardId) return [];
  if (trail.at(-1) === cardId) return [...trail];
  if (trail.at(-2) === cardId) return trail.slice(0, -1);
  return [...trail, cardId];
}
