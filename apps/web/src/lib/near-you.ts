import { placeSpot, placesByDistance, type NearbyPlace, type PlaceRow, type SyncItem } from "@orbit/core";

export interface NearbyOnCard extends NearbyPlace {
  /** The card the place is on (or is). */
  card: SyncItem;
}

export interface NearYou {
  /** Exact spots within 100 miles that aren't done, closest first (at most 8). */
  close: NearbyOnCard[];
  /** "+ 3 things to do in San Jose": city-list places with no exact spot, within 25 miles, by city. */
  towns: { city: string; count: number }[];
  /** The closest place on any list, for when nothing is close. */
  closest: NearbyOnCard | null;
}

/** Shown on cards that are visible (not deleted; archived only when the setting says so). */
function visibleCards(cards: readonly SyncItem[], showArchived: boolean): Map<string, SyncItem> {
  return new Map(cards.filter((c) => !c.deleted && (showArchived || !c.archived)).map((c) => [c.id, c]));
}

/**
 * Today's Near you, the same rule as Orbit today: places on your lists (cards and checklist rows) you haven't
 * done, by distance. Rows on a card take their card for the title and link.
 */
export function nearYou(
  places: readonly PlaceRow[],
  cards: readonly SyncItem[],
  here: { lat: number; lng: number },
  showArchived = false,
): NearYou {
  const byId = visibleCards(cards, showArchived);
  const open: NearbyOnCard[] = [];
  for (const p of placesByDistance(places, here)) {
    const card = byId.get(p.place.itemId);
    if (!card) continue;
    // A card that is itself the place follows the card's status, which the list updates at once after a tick.
    const done = p.place.checklist === null ? card.status === "done" : p.place.done;
    if (!done) open.push({ ...p, card });
  }
  const close = open.filter((p) => p.miles <= 100 && !p.approx).slice(0, 8);
  const towns = new Map<string, number>();
  for (const p of open) if (p.approx && p.city && p.miles < 25) towns.set(p.city, (towns.get(p.city) ?? 0) + 1);
  return {
    close,
    towns: [...towns].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count),
    closest: open[0] ?? null,
  };
}

/** How many places on visible cards Near you could sort once a location is set. */
export function placesWithSpot(places: readonly PlaceRow[], cards: readonly SyncItem[], showArchived = false): number {
  const byId = visibleCards(cards, showArchived);
  return places.filter((p) => byId.has(p.itemId) && placeSpot(p)).length;
}
