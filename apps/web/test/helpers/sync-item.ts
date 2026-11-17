import type { SyncItem } from "@orbit/core";

/** A made-up card for tests. */
export const syncItem = (over: Partial<SyncItem> = {}): SyncItem => ({
  id: "it1",
  kind: "Movie",
  title: "Harbor Lights",
  status: "todo",
  tags: [],
  props: {},
  due: null,
  start: null,
  archived: false,
  deleted: false,
  entityId: null,
  category: null,
  confidence: null,
  lat: null,
  lng: null,
  cover: null,
  done: 0,
  total: 0,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});
