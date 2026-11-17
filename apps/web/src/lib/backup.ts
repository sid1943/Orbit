import { type Prefs, exportFileName, exportOrbit } from "@orbit/core";
import type { ApiClient } from "../api/client.js";

export interface Backup {
  name: string;
  json: string;
  counts: { items: number; entities: number; reviews: number };
}

/**
 * The "Download everything" file: every card (deleted ones too), linked thing and review answer,
 * plus appearance, name, location and the kinds Sid added. The same format Orbit today writes, so either Orbit can load it.
 */
export async function buildBackup(
  api: Pick<ApiClient, "allFullItems" | "allEntities" | "listReviews" | "listKinds">,
  prefs: Prefs,
  now = new Date(),
): Promise<Backup> {
  const [items, entities, reviews, kinds] = await Promise.all([
    api.allFullItems(),
    api.allEntities(),
    api.listReviews(),
    api.listKinds(),
  ]);
  const custom = kinds.filter((k) => !k.standard).map((k) => ({ name: k.name, hue: k.hue }));
  const file = exportOrbit({ items, entities, reviews, prefs, kinds: custom }, now);
  return {
    name: exportFileName(now),
    json: JSON.stringify(file),
    counts: { items: items.length, entities: entities.length, reviews: reviews.length },
  };
}

/** Hands a file to the browser as a download. */
export function saveFile(name: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 2000);
}
